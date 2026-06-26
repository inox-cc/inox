import { diagnostic, throwDiagnostics } from '../diagnostics.ts'
import type { CompilerHost } from '../host.ts'
import { lowerHirToIr } from '../ir.ts'
import { emitModuleDeclarationContractResult } from '../modules/declarations.ts'
import { isRuntimeBuiltinImportSource } from '../runtime-builtins.ts'
import type { AnyNode, Diagnostic, IrProgram, ModuleGraph, ModuleRecord } from '../types.ts'
import { formatGeneratedC } from './format.ts'
import { emitCIdentifier } from './identifiers.ts'
import type { CModuleEmitOptions, CModuleImportPlan, CModuleOutputFile, CModulePlan } from './types.ts'

const cModuleSourceExtensions = ['', '.ts', '.js']

type CModuleExtension = string
type CModuleHost = CompilerHost
type CModuleInitName = string | null
type CModuleNode = AnyNode
type CModulePathSet = Set<string>
type NullableCModulePath = string | null
type NullableCModulePlan = CModulePlan | null

export type CModuleFileEmitters = {
  emitHeader(plan: CModulePlan, plans: CModulePlan[], diagnostics: Diagnostic[]): string
  emitSource(plan: CModulePlan, plans: CModulePlan[], options: CModuleEmitOptions, diagnostics: Diagnostic[]): string
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

    if (plan.external === true) {
      continue
    }

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

  if (configuredSourceRoot === null || typeof configuredSourceRoot === 'undefined') {
    sourceRootInput = commonDirectory(modulePathList, host)
  } else {
    sourceRootInput = configuredSourceRoot
  }

  const sourceRoot = host.resolvePath(sourceRootInput)

  for (let moduleIndex = 0; moduleIndex < graphModules.length; moduleIndex = moduleIndex + 1) {
    const record = graphModules[moduleIndex]
    const ir = cModulePlanIr(record)

    if (ir === null || typeof ir === 'undefined') {
      continue
    }

    const relativeSourcePath = relativeCModuleSourcePath(sourceRoot, record.path, host)
    const sourcePath = replaceCModuleExtension(relativeSourcePath, '.c', host)
    const headerPath = replaceCModuleExtension(relativeSourcePath, '.h', host)
    const declarationPath = replaceCModuleExtension(relativeSourcePath, '.d.ts', host)
    const symbolPrefix = cModuleSymbolPrefix(relativeSourcePath, record.path, host)
    let initName: CModuleInitName = null
    const isEntry = record.path === graph.entry && options.callMain !== false

    if (!isEntry) {
      initName = `${symbolPrefix}_init`
    }

    plans.push({
      record,
      ir,
      external: record.external === true,
      isEntry,
      relativeSourcePath,
      sourcePath,
      headerPath,
      declarationPath,
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
    const declarations = collectCModuleImportDeclarations(plan.record)
    const imports: CModuleImportPlan[] = []

    for (const declaration of declarations) {
      if (declaration.typeOnly || isRuntimeBuiltinImportSource(declaration.source)) {
        continue
      }

      const importedPath = resolveKnownCModuleImport(plan.record.path, declaration.source, modulePaths, host)
      let importedModule: NullableCModulePlan = null

      if (importedPath !== null && typeof importedPath !== 'undefined') {
        const candidate = plansByPath.get(importedPath)

        if (candidate !== null && typeof candidate !== 'undefined') {
          importedModule = candidate
        }
      }

      if (importedModule !== null && typeof importedModule !== 'undefined') {
        reportUnsupportedCModuleImports(declaration, importedModule, diagnostics)

        imports.push({
          declaration,
          module: importedModule
        })
      } else {
        diagnostics.push(
          diagnostic(
            'INOX_C_MODULE_IMPORT',
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

function collectCModuleImportDeclarations(record: ModuleRecord): CModuleNode[] {
  const declarations: CModuleNode[] = []

  for (const declaration of record.imports) {
    declarations.push(declaration)
  }

  for (const declaration of record.reexports) {
    declarations.push(declaration)
  }

  return declarations
}

function cModulePlanIr(record: ModuleRecord): IrProgram | null {
  if (record.ir !== null && typeof record.ir !== 'undefined') {
    return record.ir
  }

  if (record.external === true && record.declarationProgram !== null && typeof record.declarationProgram !== 'undefined') {
    return lowerHirToIr(record.declarationProgram)
  }

  return null
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
  files.push({
    kind: 'declaration',
    path: plan.declarationPath,
    sourcePath: plan.record.path,
    code: emitCModuleDeclarationContract(plan, diagnostics)
  })

  return files
}

function emitCModuleDeclarationContract(plan: CModulePlan, diagnostics: Diagnostic[]): string {
  const program = plan.record.declarationProgram

  if (program === null || typeof program === 'undefined') {
    diagnostics.push(
      diagnostic(
        'INOX_DECLARATION_CONTRACT',
        `cannot emit declaration contract for ${plan.record.path}`,
        plan.record.ast.loc
      )
    )
    return ''
  }

  const result = emitModuleDeclarationContractResult(program)

  for (const item of result.diagnostics) {
    diagnostics.push(item)
  }

  return result.code
}

function reportUnsupportedCModuleImports(
  declaration: AnyNode,
  importedModule: CModulePlan,
  diagnostics: Diagnostic[]
): void {
  const specifiers: CModuleNode[] = declaration.specifiers

  for (const specifier of specifiers) {
    const exported = moduleExportedDeclaration(importedModule.record, specifier.imported)

    if (
      exported === null ||
      typeof exported === 'undefined' ||
      exported.type === 'FunctionDeclaration' ||
      exported.type === 'VariableDeclaration'
    ) {
      continue
    }

    diagnostics.push(
      diagnostic(
        'INOX_C_MODULE_IMPORT',
        'modular C output currently supports importing exported functions only',
        specifier.loc
      )
    )
  }
}

function moduleExportedDeclaration(module: ModuleRecord, name: string): AnyNode | null {
  const declarationProgram = module.declarationProgram

  if (declarationProgram !== null && typeof declarationProgram !== 'undefined') {
    const declaration = findExportedDeclaration(declarationProgram, name)

    if (declaration !== null) {
      return declaration
    }
  }

  const fallback = module.exports.get(name)

  if (fallback !== null && typeof fallback !== 'undefined') {
    return fallback
  }

  return null
}

function findExportedDeclaration(program: AnyNode, name: string): AnyNode | null {
  const body: AnyNode[] = program.body

  for (const item of body) {
    if (
      item.exported === true &&
      item.name === name &&
      (item.type === 'FunctionDeclaration' ||
        item.type === 'ClassDeclaration' ||
        item.type === 'VariableDeclaration' ||
        item.type === 'TypeAliasDeclaration')
    ) {
      return item
    }
  }

  return null
}

export function uniqueCModuleImports(imports: CModuleImportPlan[]): CModuleImportPlan[] {
  const seen: Set<string> = new Set()
  const unique: CModuleImportPlan[] = []

  for (const item of imports) {
    const module = item.module

    if (module === null || typeof module === 'undefined') {
      continue
    }

    const headerPath = module.headerPath

    if (seen.has(headerPath)) {
      continue
    }

    seen.add(headerPath)
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

  const externalName = `${shortCModuleHash(file, host)}_${emitCIdentifier(file)}`
  const externalPath = host.joinPath('external', externalName)

  return toCPath(externalPath, host)
}

function replaceCModuleExtension(path: string, extension: CModuleExtension, host: CModuleHost): string {
  const currentExtension = host.posixPath.extname(path)

  if (currentExtension === '') {
    return `${path}${extension}`
  }

  return `${path.slice(0, -currentExtension.length)}${extension}`
}

function cModuleSymbolPrefix(relativeSourcePath: string, sourcePath: string, host: CModuleHost): string {
  return `inox_mod_${emitCIdentifier(relativeSourcePath)}_${shortCModuleHash(sourcePath, host)}`
}

function shortCModuleHash(value: string, host: CModuleHost): string {
  return host.shortHash(value)
}

export function relativeCIncludePath(fromSourcePath: string, toHeaderPath: string, host: CModuleHost): string {
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

    while (length > 0 && cModulePathPrefix(first, length, host) !== cModulePathPrefix(path, length, host)) {
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
