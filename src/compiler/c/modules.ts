import { createHash } from 'node:crypto'
import { dirname, extname, isAbsolute, join, normalize, posix as pathPosix, relative, resolve, sep } from 'node:path'
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
  const sourceRoot = resolve(options.sourceRoot ?? commonDirectory(graph.modules.map((module) => module.path)))
  const plans: CModulePlan[] = graph.modules.flatMap((record) => {
    if (record.ir == null) {
      return []
    }

    const relativeSourcePath = relativeCModuleSourcePath(sourceRoot, record.path)
    const sourcePath = replaceCModuleExtension(relativeSourcePath, '.c')
    const headerPath = replaceCModuleExtension(relativeSourcePath, '.h')
    const symbolPrefix = cModuleSymbolPrefix(relativeSourcePath, record.path)

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

      const importedPath = resolveKnownCModuleImport(plan.record.path, declaration.source, modulePaths)
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

function resolveKnownCModuleImport(from: string, specifier: string, modulePaths: Set<string>): string | null {
  const normalized = normalize(resolve(dirname(from), specifier))
  const candidates =
    extname(normalized) === ''
      ? [
          ...cModuleSourceExtensions.map((extension) => `${normalized}${extension}`),
          ...cModuleSourceExtensions.map((extension) => join(normalized, `index${extension}`))
        ]
      : [normalized]

  return candidates.find((candidate) => modulePaths.has(candidate)) ?? null
}

function relativeCModuleSourcePath(sourceRoot: string, file: string): string {
  const relativePath = normalize(relative(sourceRoot, file))

  if (relativePath !== '' && !relativePath.startsWith('..') && !isAbsolute(relativePath)) {
    return toCPath(relativePath)
  }

  return toCPath(join('external', `${shortCModuleHash(file)}_${emitCIdentifier(file)}`))
}

function replaceCModuleExtension(path: string, extension: '.c' | '.h'): string {
  const currentExtension = pathPosix.extname(path)

  return currentExtension === '' ? `${path}${extension}` : `${path.slice(0, -currentExtension.length)}${extension}`
}

function cModuleSymbolPrefix(relativeSourcePath: string, sourcePath: string): string {
  return `ccjs_mod_${emitCIdentifier(relativeSourcePath)}_${shortCModuleHash(sourcePath)}`
}

function shortCModuleHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 8)
}

export function relativeCIncludePath(fromSourcePath: string, toHeaderPath: string): string {
  const includePath = pathPosix.relative(pathPosix.dirname(fromSourcePath), toHeaderPath)

  return includePath === '' ? pathPosix.basename(toHeaderPath) : includePath
}

function toCPath(path: string): string {
  return sep === '/' ? path : path.split(sep).join('/')
}

function commonDirectory(paths: string[]): string {
  if (paths.length === 0) {
    return '.'
  }

  const [first, ...rest] = paths.map((item) => resolve(item).split(sep))
  let length = first.length

  for (const path of rest) {
    while (length > 0 && first.slice(0, length).join(sep) !== path.slice(0, length).join(sep)) {
      length -= 1
    }
  }

  return first.slice(0, length).join(sep) || sep
}
