import { diagnostic, throwDiagnostics } from '../diagnostics.ts'
import { isRuntimeBuiltinImportSource } from '../runtime-builtins.ts'
import { formatGeneratedC } from './format.ts'
import { emitCIdentifier } from './identifiers.ts'
import type { CompilerHost } from '../host.ts'
import type { AnyNode, Diagnostic, ModuleGraph } from '../types.ts'
import type { CModuleEmitOptions, CModuleImportPlan, CModuleOutputFile, CModulePlan } from './types.ts'

const cModuleSourceExtensions = ['', '.ts', '.js']

type CModuleExtension = string
type CModuleHost = CompilerHost
type CModuleInitName = string | null
type CModulePathSet = Set<string>
type NullableCModulePath = string | null
type NullableCModulePlan = CModulePlan | null

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
  const files: CModuleOutputFile[] = []

  for (let planIndex = 0; planIndex < plans.length; planIndex = planIndex + 1) {
    const plan = plans[planIndex]
    pushCModuleOutputFiles(files, emitCModuleFiles(plan, plans, options, diagnostics, emitters))
  }

  throwDiagnostics(diagnostics)

  return files
}

function createCModulePlans(graph: ModuleGraph, options: CModuleEmitOptions, diagnostics: Diagnostic[]): CModulePlan[] {
  const modulePaths: CModulePathSet = new Set()
  const modulePathList: string[] = []
  const host = options.host
  const configuredSourceRoot = options.sourceRoot
  let sourceRootInput = ''
  const plans: CModulePlan[] = []
  const plansByPath: Map<string, CModulePlan> = new Map()

  const graphModules = graph.modules

  for (let moduleIndex = 0; moduleIndex < graphModules.length; moduleIndex = moduleIndex + 1) {
    const item = graphModules[moduleIndex]
    modulePaths.add(item.path)
    modulePathList.push(item.path)
  }

  if (configuredSourceRoot == null) {
    sourceRootInput = commonDirectory(modulePathList, host)
  } else {
    sourceRootInput = configuredSourceRoot
  }

  const sourceRoot = host.resolvePath(sourceRootInput)

  for (let moduleIndex = 0; moduleIndex < graphModules.length; moduleIndex = moduleIndex + 1) {
    const record = graphModules[moduleIndex]

    if (record.ir == null) {
      continue
    }

    const relativeSourcePath = relativeCModuleSourcePath(sourceRoot, record.path, host)
    const sourcePath = replaceCModuleExtension(relativeSourcePath, '.c', host)
    const headerPath = replaceCModuleExtension(relativeSourcePath, '.h', host)
    const symbolPrefix = cModuleSymbolPrefix(relativeSourcePath, record.path, host)
    let initName: CModuleInitName = null

    if (record.path !== graph.entry) {
      initName = `${symbolPrefix}_init`
    }

    plans.push({
      record,
      ir: record.ir,
      isEntry: record.path === graph.entry,
      relativeSourcePath,
      sourcePath,
      headerPath,
      symbolPrefix,
      headerGuard: `${symbolPrefix.toUpperCase()}_H`,
      initName,
      imports: []
    })
  }

  for (let planIndex = 0; planIndex < plans.length; planIndex = planIndex + 1) {
    const plan = plans[planIndex]
    plansByPath.set(plan.record.path, plan)
  }

  for (let planIndex = 0; planIndex < plans.length; planIndex = planIndex + 1) {
    const plan = plans[planIndex]
    const imports: CModuleImportPlan[] = []

    for (const declaration of plan.record.imports) {
      if (declaration.typeOnly || isRuntimeBuiltinImportSource(declaration.source)) {
        continue
      }

      const importedPath = resolveKnownCModuleImport(plan.record.path, declaration.source, modulePaths, host)
      let importedModule: NullableCModulePlan = null

      if (importedPath != null) {
        const candidate = plansByPath.get(importedPath)

        if (candidate != null) {
          importedModule = candidate
        }
      }

      if (importedModule != null) {
        reportUnsupportedCModuleImports(declaration, importedModule, diagnostics)

        imports.push({
          declaration,
          module: importedModule
        })
      } else {
        diagnostics.push(
          diagnostic(
            'CCJS_C_MODULE_IMPORT',
            `cannot resolve generated C module for ${declaration.source}`,
            declaration.loc
          )
        )
      }
    }

    plan.imports = imports
  }

  return plans
}

function pushCModuleOutputFiles(target: CModuleOutputFile[], source: CModuleOutputFile[]): void {
  for (let index = 0; index < source.length; index = index + 1) {
    target.push(source[index])
  }
}

function emitCModuleFiles(
  plan: CModulePlan,
  plans: CModulePlan[],
  options: CModuleEmitOptions,
  diagnostics: Diagnostic[],
  emitters: CModuleFileEmitters
): CModuleOutputFile[] {
  const files: CModuleOutputFile[] = []

  files.push({
    kind: 'source',
    path: plan.sourcePath,
    sourcePath: plan.record.path,
    code: formatGeneratedC(emitters.emitSource(plan, plans, options, diagnostics), plan.sourcePath)
  })
  files.push({
    kind: 'header',
    path: plan.headerPath,
    sourcePath: plan.record.path,
    code: formatGeneratedC(emitters.emitHeader(plan, plans, diagnostics), plan.headerPath)
  })

  return files
}

function reportUnsupportedCModuleImports(
  declaration: AnyNode,
  importedModule: CModulePlan,
  diagnostics: Diagnostic[]
): void {
  for (const specifier of declaration.specifiers) {
    const exported = importedModule.record.exports.get(specifier.imported)

    if (exported == null || exported.type === 'FunctionDeclaration' || exported.type === 'VariableDeclaration') {
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
  const seen: Set<string> = new Set()
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
  fromPath: string,
  specifier: string,
  modulePaths: CModulePathSet,
  host: CModuleHost
): NullableCModulePath {
  const normalized = host.normalizePath(host.resolvePath(host.joinPath(host.dirname(fromPath), specifier)))
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

  for (const candidate of candidates) {
    if (modulePaths.has(candidate)) {
      return candidate
    }
  }

  return null
}

function relativeCModuleSourcePath(sourceRoot: string, file: string, host: CModuleHost): string {
  const relativePath = host.normalizePath(host.relativePath(sourceRoot, file))

  if (relativePath !== '' && !relativePath.startsWith('..') && !host.isAbsolutePath(relativePath)) {
    return toCPath(relativePath, host)
  }

  return toCPath(host.joinPath('external', `${shortCModuleHash(file, host)}_${emitCIdentifier(file)}`), host)
}

function replaceCModuleExtension(path: string, extension: CModuleExtension, host: CModuleHost): string {
  const currentExtension = host.posixPath.extname(path)

  if (currentExtension === '') {
    return `${path}${extension}`
  }

  return `${path.slice(0, -currentExtension.length)}${extension}`
}

function cModuleSymbolPrefix(
  relativeSourcePath: string,
  sourcePath: string,
  host: CModuleHost
): string {
  return `ccjs_mod_${emitCIdentifier(relativeSourcePath)}_${shortCModuleHash(sourcePath, host)}`
}

function shortCModuleHash(value: string, host: CModuleHost): string {
  return host.shortHash(value)
}

export function relativeCIncludePath(
  fromSourcePath: string,
  toHeaderPath: string,
  host: CModuleHost
): string {
  const includePath = host.posixPath.relative(host.posixPath.dirname(fromSourcePath), toHeaderPath)

  if (includePath === '') {
    return host.posixPath.basename(toHeaderPath)
  }

  return includePath
}

function toCPath(path: string, host: CModuleHost): string {
  if (host.pathSeparator === '/') {
    return path
  }

  return joinStrings(path.split(host.pathSeparator), '/')
}

function commonDirectory(paths: string[], host: CModuleHost): string {
  if (paths.length === 0) {
    return '.'
  }

  const first = cModuleResolvedPathSegments(paths[0], host)
  let length = first.length

  for (let pathIndex = 1; pathIndex < paths.length; pathIndex = pathIndex + 1) {
    const path = cModuleResolvedPathSegments(paths[pathIndex], host)

    while (
      length > 0 &&
      cModulePathPrefix(first, length, host) !== cModulePathPrefix(path, length, host)
    ) {
      length = length - 1
    }
  }

  const directory = cModulePathPrefix(first, length, host)

  if (directory === '') {
    return host.pathSeparator
  }

  return directory
}

function cModuleResolvedPathSegments(path: string, host: CModuleHost): string[] {
  return host.resolvePath(path).split(host.pathSeparator)
}

function cModulePathPrefix(segments: string[], length: number, host: CModuleHost): string {
  const prefix: string[] = []

  for (let index = 0; index < length; index = index + 1) {
    prefix.push(segments[index])
  }

  return joinStrings(prefix, host.pathSeparator)
}

function joinStrings(values: string[], separator: string): string {
  let result = ''

  for (let index = 0; index < values.length; index = index + 1) {
    if (index > 0) {
      result = result + separator
    }

    result = result + values[index]
  }

  return result
}
