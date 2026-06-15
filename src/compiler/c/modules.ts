import { CompileError, diagnostic } from '../diagnostics.ts'
import { isRuntimeBuiltinImportSource } from '../runtime-builtins.ts'
import { formatGeneratedC } from './format.ts'
import { emitCIdentifier } from './identifiers.ts'
import type { AnyNode, Diagnostic, ModuleGraph } from '../types.ts'
import type { CModuleEmitOptions, CModuleImportPlan, CModuleOutputFile, CModulePlan } from './types.ts'

const cModuleSourceExtensions = ['', '.ts', '.js']

export type CModuleFileEmitters = {
  emitHeader(plan: CModulePlan, plans: CModulePlan[], diagnostics: Diagnostic[]): string
  emitSource(
    plan: CModulePlan,
    plans: CModulePlan[],
    options: CModuleEmitOptions,
    diagnostics: Diagnostic[]
  ): string
}

export function emitCModuleFilesFromGraph(
  graph: ModuleGraph,
  options: CModuleEmitOptions,
  emitters: CModuleFileEmitters
): CModuleOutputFile[] {
  const diagnostics: Diagnostic[] = []
  const plans = createCModulePlans(graph, options, diagnostics)
  const files = plans.flatMap((plan) => emitCModuleFiles(plan, plans, options, diagnostics, emitters))

  if (diagnostics.length > 0) {
    throw new CompileError(diagnostics)
  }

  return files
}

function createCModulePlans(graph: ModuleGraph, options: CModuleEmitOptions, diagnostics: Diagnostic[]): CModulePlan[] {
  const modulePaths = new Set(graph.modules.map((module) => module.path))
  const host = options.host
  const sourceRoot = host.resolvePath(
    options.sourceRoot ?? commonDirectory(graph.modules.map((module) => module.path), host)
  )
  const plans: CModulePlan[] = graph.modules.flatMap((record) => {
    if (record.ir == null) {
      return []
    }

    const relativeSourcePath = relativeCModuleSourcePath(sourceRoot, record.path, host)
    const sourcePath = replaceCModuleExtension(relativeSourcePath, '.c', host)
    const headerPath = replaceCModuleExtension(relativeSourcePath, '.h', host)
    const symbolPrefix = cModuleSymbolPrefix(relativeSourcePath, record.path, host)

    return [
      {
        record,
        ir: record.ir,
        isEntry: record.path === graph.entry,
        relativeSourcePath,
        sourcePath,
        headerPath,
        symbolPrefix,
        headerGuard: `${symbolPrefix.toUpperCase()}_H`,
        initName: record.path === graph.entry ? null : `${symbolPrefix}_init`,
        imports: []
      }
    ]
  })
  const plansByPath = new Map(plans.map((plan) => [plan.record.path, plan]))

  for (const plan of plans) {
    plan.imports = plan.record.imports.flatMap((declaration) => {
      if (declaration.typeOnly || isRuntimeBuiltinImportSource(declaration.source)) {
        return []
      }

      const importedPath = resolveKnownCModuleImport(plan.record.path, declaration.source, modulePaths, host)
      const importedModule = importedPath == null ? null : plansByPath.get(importedPath)

      if (importedModule == null) {
        diagnostics.push(
          diagnostic(
            'CCJS_C_MODULE_IMPORT',
            `cannot resolve generated C module for ${declaration.source}`,
            declaration.loc
          )
        )
        return []
      }

      reportUnsupportedCModuleImports(declaration, importedModule, diagnostics)

      return [
        {
          declaration,
          module: importedModule
        }
      ]
    })
  }

  return plans
}

function emitCModuleFiles(
  plan: CModulePlan,
  plans: CModulePlan[],
  options: CModuleEmitOptions,
  diagnostics: Diagnostic[],
  emitters: CModuleFileEmitters
): CModuleOutputFile[] {
  return [
    {
      kind: 'source',
      path: plan.sourcePath,
      sourcePath: plan.record.path,
      code: formatGeneratedC(emitters.emitSource(plan, plans, options, diagnostics), plan.sourcePath)
    },
    {
      kind: 'header',
      path: plan.headerPath,
      sourcePath: plan.record.path,
      code: formatGeneratedC(emitters.emitHeader(plan, plans, diagnostics), plan.headerPath)
    }
  ]
}

function reportUnsupportedCModuleImports(
  declaration: AnyNode,
  importedModule: CModulePlan,
  diagnostics: Diagnostic[]
): void {
  for (const specifier of declaration.specifiers) {
    const exported = importedModule.record.exports.get(specifier.imported)

    if (exported == null || exported.type === 'FunctionDeclaration') {
      continue
    }

    diagnostics.push(
      diagnostic(
        'CCJS_C_MODULE_IMPORT',
        'modular C output currently supports importing exported functions only',
        specifier.loc
      )
    )
  }
}

export function uniqueCModuleImports(imports: CModuleImportPlan[]): CModuleImportPlan[] {
  const seen = new Set<string>()
  const unique: CModuleImportPlan[] = []

  for (const item of imports) {
    if (seen.has(item.module.headerPath)) {
      continue
    }

    seen.add(item.module.headerPath)
    unique.push(item)
  }

  return unique
}

function resolveKnownCModuleImport(
  from: string,
  specifier: string,
  modulePaths: Set<string>,
  host: CModuleEmitOptions['host']
): string | null {
  const normalized = host.normalizePath(host.resolvePath(host.joinPath(host.dirname(from), specifier)))
  const candidates: string[] = []

  if (host.extname(normalized) === '') {
    for (const extension of cModuleSourceExtensions) {
      candidates.push(`${normalized}${extension}`)
    }

    for (const extension of cModuleSourceExtensions) {
      candidates.push(host.joinPath(normalized, `index${extension}`))
    }
  } else {
    candidates.push(normalized)
  }

  return candidates.find((candidate) => modulePaths.has(candidate)) ?? null
}

function relativeCModuleSourcePath(sourceRoot: string, file: string, host: CModuleEmitOptions['host']): string {
  const relativePath = host.normalizePath(host.relativePath(sourceRoot, file))

  if (relativePath !== '' && !relativePath.startsWith('..') && !host.isAbsolutePath(relativePath)) {
    return toCPath(relativePath, host)
  }

  return toCPath(host.joinPath('external', `${shortCModuleHash(file, host)}_${emitCIdentifier(file)}`), host)
}

function replaceCModuleExtension(path: string, extension: '.c' | '.h', host: CModuleEmitOptions['host']): string {
  const currentExtension = host.posixPath.extname(path)

  return currentExtension === '' ? `${path}${extension}` : `${path.slice(0, -currentExtension.length)}${extension}`
}

function cModuleSymbolPrefix(
  relativeSourcePath: string,
  sourcePath: string,
  host: CModuleEmitOptions['host']
): string {
  return `ccjs_mod_${emitCIdentifier(relativeSourcePath)}_${shortCModuleHash(sourcePath, host)}`
}

function shortCModuleHash(value: string, host: CModuleEmitOptions['host']): string {
  return host.shortHash(value)
}

export function relativeCIncludePath(
  fromSourcePath: string,
  toHeaderPath: string,
  host: CModuleEmitOptions['host']
): string {
  const includePath = host.posixPath.relative(host.posixPath.dirname(fromSourcePath), toHeaderPath)

  return includePath === '' ? host.posixPath.basename(toHeaderPath) : includePath
}

function toCPath(path: string, host: CModuleEmitOptions['host']): string {
  return host.pathSeparator === '/' ? path : path.split(host.pathSeparator).join('/')
}

function commonDirectory(paths: string[], host: CModuleEmitOptions['host']): string {
  if (paths.length === 0) {
    return '.'
  }

  const [first, ...rest] = paths.map((item) => host.resolvePath(item).split(host.pathSeparator))
  let length = first.length

  for (const path of rest) {
    while (
      length > 0 &&
      first.slice(0, length).join(host.pathSeparator) !== path.slice(0, length).join(host.pathSeparator)
    ) {
      length -= 1
    }
  }

  return first.slice(0, length).join(host.pathSeparator) || host.pathSeparator
}
