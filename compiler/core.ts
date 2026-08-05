import { checkCppCompileBudgets } from './budgets.ts'
import type {
  CppEmitOptions,
  CppModuleEmitOptions,
  CppModuleOutputFile
} from './backends/cpp/types.ts'
import { checkCppProfileCapabilities } from './capabilities.ts'
import { checkProgram } from './checker.ts'
import { emitCppBundleFromIrModules, emitCppFromIr, emitCppModuleFilesFromGraph } from './codegen-cpp.ts'
import type { CompilerHost } from './host.ts'
import { resolveCompilerLibrarySet } from './extensions/library-set.ts'
import { compilerLibraryOptionsFingerprint } from './extensions/library-options.ts'
import type { CompilerLibraryLiteralTypeInference, CompilerLibrarySet } from './extensions/types.ts'
import type { CompilerLibraryOptionValue } from './extensions/types.ts'
import { collectIrModuleRecords, collectIrRuntimeRequirements, lowerHirToIr } from './ir.ts'
import type { IrModuleRecord } from './ir/top-level.ts'
import { tokenize } from './lexer.ts'
import { lowerProgram } from './lower.ts'
import type { MemoryCompilerSourceFile } from './memory-host.ts'
import { createMemoryCompilerHost } from './memory-host.ts'
import { buildModuleGraphWithHostSync } from './modules/graph.ts'
import { parse } from './parser.ts'
import type {
  CompileOptions,
  CompileTarget,
  FileCompileResult,
  IrProgram,
  ModuleDeclarationImport,
  ModuleGraph,
  ProgramNode,
  RuntimeBudgets,
  RuntimeCapabilities,
  RuntimeProfile,
  SourceCompileResult
} from './types.ts'

export type CppModuleCompileOptions = {
  target?: CompileTarget
  callMain?: boolean
  budgets?: RuntimeBudgets
  capabilities?: RuntimeCapabilities
  declarationImports?: ModuleDeclarationImport[]
  host?: CompilerHost
  libraries?: CompilerLibrarySet
  libraryOptions?: CompilerLibraryOptionValue[]
  profile?: RuntimeProfile
  sourceRoot?: string
}

export type MemoryCompileOptions = {
  target?: CompileTarget
  callMain?: boolean
  budgets?: RuntimeBudgets
  capabilities?: RuntimeCapabilities
  declarationImports?: ModuleDeclarationImport[]
  libraries?: CompilerLibrarySet
  libraryOptions?: CompilerLibraryOptionValue[]
  profile?: RuntimeProfile
  root?: string
}

export type MemoryCppModuleCompileOptions = {
  target?: CompileTarget
  callMain?: boolean
  budgets?: RuntimeBudgets
  capabilities?: RuntimeCapabilities
  declarationImports?: ModuleDeclarationImport[]
  libraries?: CompilerLibrarySet
  libraryOptions?: CompilerLibraryOptionValue[]
  profile?: RuntimeProfile
  root?: string
  sourceRoot?: string
}

export type CppModuleCompileResult = {
  target: 'cc'
  graph: ModuleGraph
  files: CppModuleOutputFile[]
  irRuntimeRequirements: string[]
}

export type CppModuleTextFile = {
  path: string
  code: string
}

export type SourceIrCompileResult = {
  target: CompileTarget
  ast: ProgramNode
  hir: ProgramNode
  ir: IrProgram
}

export type GraphIrCompileResult = {
  target: CompileTarget
  graph: ModuleGraph
  irModules: IrModuleRecord[]
}

export function compileSource(
  source: string,
  options: CompileOptions = {},
  libraryLiteralTypeInference: CompilerLibraryLiteralTypeInference | null = null
): SourceCompileResult {
  const compiled = compileSourceToIr(source, options, libraryLiteralTypeInference)

  runCppStaticChecks([compiled.ir], options)

  return {
    target: compiled.target,
    ast: compiled.ast,
    hir: compiled.hir,
    ir: compiled.ir,
    code: emitTargetFromIr(compiled.target, compiled.ir, options)
  }
}

export function compileSourceToIr(
  source: string,
  options: CompileOptions = {},
  libraryLiteralTypeInference: CompilerLibraryLiteralTypeInference | null = null
): SourceIrCompileResult {
  const target = resolveCompileTarget(options)
  const libraries = resolveCompilerLibrarySet(options.libraries)
  const tokens = tokenize(source, {})
  const ast = parse(tokens)
  const checked = checkProgram(
    ast,
    compileOptionsWithTargetAndLibraries(options, target, libraries),
    libraryLiteralTypeInference
  )
  const hir = lowerProgram(checked.ast, libraries)
  const ir = lowerHirToIr(
    hir,
    libraries.fingerprint,
    compilerLibraryOptionsFingerprint(libraries, options.libraryOptions),
    libraries
  )

  return {
    target,
    ast: checked.ast,
    hir,
    ir
  }
}

export function emitTargetFromIr(target: CompileTarget, ir: IrProgram, options: CompileOptions = {}): string {
  assertIrLibrarySetFingerprint(ir, options)

  if (target === 'cc') {
    const emitOptions: CppEmitOptions = options

    return emitCppFromIr(ir, emitOptions)
  }

  throw new Error(`Unsupported target ${target}`)
}

export async function compileFile(
  entry: string,
  options: CompileOptions = {},
  libraryLiteralTypeInference: CompilerLibraryLiteralTypeInference | null = null
): Promise<FileCompileResult> {
  const compiled = await compileGraphToIrModules(entry, options, libraryLiteralTypeInference)

  return emitFileCompileResult(compiled, options)
}

export function compileFileSync(
  entry: string,
  options: CompileOptions = {},
  libraryLiteralTypeInference: CompilerLibraryLiteralTypeInference | null = null
): FileCompileResult {
  const compiled = compileGraphToIrModulesSync(entry, options, libraryLiteralTypeInference)

  return emitFileCompileResult(compiled, options)
}

export function compileFileWithHostSync(
  entry: string,
  options: CompileOptions,
  host: CompilerHost,
  libraryLiteralTypeInference: CompilerLibraryLiteralTypeInference | null = null
): FileCompileResult {
  const compiled = compileGraphToIrModulesWithHostSync(entry, options, host, libraryLiteralTypeInference)

  return emitFileCompileResult(compiled, compileOptionsWithHostAndTarget(options, host, compiled.target))
}

function emitFileCompileResult(compiled: GraphIrCompileResult, options: CompileOptions): FileCompileResult {
  const irModules: IrProgram[] = []

  for (let moduleIndex = 0; moduleIndex < compiled.irModules.length; moduleIndex = moduleIndex + 1) {
    const module = compiled.irModules[moduleIndex]

    irModules.push(module.ir)
  }

  runCppStaticChecks(irModules, options)
  const code = emitCppBundleFromIrModules(compiled.irModules, compiled.graph.entry, options)

  return {
    target: compiled.target,
    graph: compiled.graph,
    irRuntimeRequirements: collectIrRuntimeRequirements(irModules),
    code
  }
}

export async function compileFileToCppModules(
  entry: string,
  options: CppModuleCompileOptions = {},
  libraryLiteralTypeInference: CompilerLibraryLiteralTypeInference | null = null
): Promise<CppModuleCompileResult> {
  return compileFileToCppModulesSync(entry, options, libraryLiteralTypeInference)
}

export function compileFileToCppModulesSync(
  entry: string,
  options: CppModuleCompileOptions = {},
  libraryLiteralTypeInference: CompilerLibraryLiteralTypeInference | null = null
): CppModuleCompileResult {
  if (options.host === null || typeof options.host === 'undefined') {
    throw new Error('compileFileToCppModules requires a compiler host')
  }

  return compileFileToCppModulesWithHostSync(entry, options, options.host, libraryLiteralTypeInference)
}

export function compileFileToCppModulesWithHostSync(
  entry: string,
  options: CppModuleCompileOptions,
  host: CompilerHost,
  libraryLiteralTypeInference: CompilerLibraryLiteralTypeInference | null = null
): CppModuleCompileResult {
  const compiled = compileGraphToIrModulesWithHostSync(
    entry,
    cppModuleOptionsWithHostAndTarget(options, host, 'cc'),
    host,
    libraryLiteralTypeInference
  )
  const irModules: IrProgram[] = []

  for (let moduleIndex = 0; moduleIndex < compiled.irModules.length; moduleIndex = moduleIndex + 1) {
    const module = compiled.irModules[moduleIndex]

    irModules.push(module.ir)
  }

  runCppStaticChecks(irModules, options)

  const emitOptions: CppModuleEmitOptions = {
    callMain: options.callMain,
    host,
    libraries: options.libraries,
    libraryOptions: options.libraryOptions,
    sourceRoot: options.sourceRoot
  }

  return {
    target: 'cc',
    graph: compiled.graph,
    files: emitCppModuleFilesFromGraph(compiled.graph, emitOptions),
    irRuntimeRequirements: collectIrRuntimeRequirements(irModules)
  }
}

export function compileFileToCppModuleTextsSync(
  entry: string,
  options: CppModuleCompileOptions = {},
  libraryLiteralTypeInference: CompilerLibraryLiteralTypeInference | null = null
): CppModuleTextFile[] {
  if (options.host === null || typeof options.host === 'undefined') {
    throw new Error('compileFileToCppModuleTexts requires a compiler host')
  }

  return compileFileToCppModuleTextsWithHostSync(entry, options, options.host, libraryLiteralTypeInference)
}

export function compileFileToCppModuleTextsWithHostSync(
  entry: string,
  options: CppModuleCompileOptions,
  host: CompilerHost,
  libraryLiteralTypeInference: CompilerLibraryLiteralTypeInference | null = null
): CppModuleTextFile[] {
  const compiled = compileGraphToIrModulesWithHostSync(
    entry,
    cppModuleOptionsWithHostAndTarget(options, host, 'cc'),
    host,
    libraryLiteralTypeInference
  )
  const irModules: IrProgram[] = []

  for (let moduleIndex = 0; moduleIndex < compiled.irModules.length; moduleIndex = moduleIndex + 1) {
    const module = compiled.irModules[moduleIndex]

    irModules.push(module.ir)
  }

  runCppStaticChecks(irModules, options)

  const emitOptions: CppModuleEmitOptions = {
    callMain: options.callMain,
    host,
    libraries: options.libraries,
    libraryOptions: options.libraryOptions,
    sourceRoot: options.sourceRoot
  }
  const files: CppModuleTextFile[] = emitCppModuleFilesFromGraph(compiled.graph, emitOptions)
  const texts: CppModuleTextFile[] = []

  for (let fileIndex = 0; fileIndex < files.length; fileIndex = fileIndex + 1) {
    const file = files[fileIndex]

    texts.push({
      path: file.path,
      code: file.code
    })
  }

  return texts
}

export async function compileMemoryPackageToIrModules(
  entry: string,
  files: MemoryCompilerSourceFile[],
  options: MemoryCompileOptions = {},
  libraryLiteralTypeInference: CompilerLibraryLiteralTypeInference | null = null
): Promise<GraphIrCompileResult> {
  const host = createMemoryCompilerHost(files, { root: options.root })

  return compileGraphToIrModules(entry, memoryCompileOptions(options, host), libraryLiteralTypeInference)
}

export async function compileMemoryPackageToCppModules(
  entry: string,
  files: MemoryCompilerSourceFile[],
  options: MemoryCppModuleCompileOptions = {},
  libraryLiteralTypeInference: CompilerLibraryLiteralTypeInference | null = null
): Promise<CppModuleCompileResult> {
  const host = createMemoryCompilerHost(files, { root: options.root })

  return compileFileToCppModules(entry, memoryCppModuleCompileOptions(options, host), libraryLiteralTypeInference)
}

export async function compileGraphToIrModules(
  entry: string,
  options: CompileOptions = {},
  libraryLiteralTypeInference: CompilerLibraryLiteralTypeInference | null = null
): Promise<GraphIrCompileResult> {
  return compileGraphToIrModulesSync(entry, options, libraryLiteralTypeInference)
}

export function compileGraphToIrModulesSync(
  entry: string,
  options: CompileOptions = {},
  libraryLiteralTypeInference: CompilerLibraryLiteralTypeInference | null = null
): GraphIrCompileResult {
  if (options.host === null || typeof options.host === 'undefined') {
    throw new Error('compileGraphToIrModules requires a compiler host')
  }

  return compileGraphToIrModulesWithHostSync(entry, options, options.host, libraryLiteralTypeInference)
}

export function compileGraphToIrModulesWithHostSync(
  entry: string,
  options: CompileOptions,
  host: CompilerHost,
  libraryLiteralTypeInference: CompilerLibraryLiteralTypeInference | null = null
): GraphIrCompileResult {
  const target = resolveCompileTarget(options)
  const graph = buildModuleGraphWithHostSync(
    entry,
    compileOptionsWithHostAndTarget(options, host, target),
    host,
    libraryLiteralTypeInference
  )
  const irModules = collectIrModuleRecords(graph)

  return {
    target,
    graph,
    irModules
  }
}

export function runCppStaticChecks(irs: IrProgram[], options: CompileOptions = {}): void {
  for (let index = 0; index < irs.length; index = index + 1) {
    assertIrLibrarySetFingerprint(irs[index], options)
  }

  checkCppProfileCapabilities(irs, options)
  checkCppCompileBudgets(irs, options)
}

function resolveCompileTarget(options: CompileOptions): CompileTarget {
  const target = options.target

  if (target === null || typeof target === 'undefined' || target === 'cc') {
    return 'cc'
  }

  throw new Error(`Unsupported target ${target}`)
}

function compileOptionsWithTargetAndLibraries(
  options: CompileOptions,
  target: CompileTarget,
  libraries: CompilerLibrarySet
): CompileOptions {
  return {
    target,
    callMain: options.callMain,
    budgets: options.budgets,
    capabilities: options.capabilities,
    declarationImports: options.declarationImports,
    host: options.host,
    libraries,
    libraryOptions: options.libraryOptions,
    profile: options.profile
  }
}

function compileOptionsWithHostAndTarget(
  options: CompileOptions,
  host: CompilerHost,
  target: CompileTarget
): CompileOptions {
  return {
    target,
    callMain: options.callMain,
    budgets: options.budgets,
    capabilities: options.capabilities,
    declarationImports: options.declarationImports,
    host,
    libraries: options.libraries,
    libraryOptions: options.libraryOptions,
    profile: options.profile
  }
}

function cppModuleOptionsWithHostAndTarget(
  options: CppModuleCompileOptions,
  host: CompilerHost,
  target: CompileTarget
): CompileOptions {
  return {
    target,
    callMain: options.callMain,
    budgets: options.budgets,
    capabilities: options.capabilities,
    declarationImports: options.declarationImports,
    host,
    libraries: options.libraries,
    libraryOptions: options.libraryOptions,
    profile: options.profile
  }
}

function memoryCompileOptions(options: MemoryCompileOptions, host: any): CompileOptions {
  return {
    target: options.target,
    callMain: options.callMain,
    budgets: options.budgets,
    capabilities: options.capabilities,
    declarationImports: options.declarationImports,
    host,
    libraries: options.libraries,
    libraryOptions: options.libraryOptions,
    profile: options.profile
  }
}

function memoryCppModuleCompileOptions(options: MemoryCppModuleCompileOptions, host: any): CppModuleCompileOptions {
  const base = memoryCompileOptions(options, host)

  return {
    target: base.target,
    callMain: base.callMain,
    budgets: base.budgets,
    capabilities: base.capabilities,
    declarationImports: base.declarationImports,
    host: base.host,
    libraries: base.libraries,
    libraryOptions: base.libraryOptions,
    profile: base.profile,
    sourceRoot: options.sourceRoot
  }
}

function assertIrLibrarySetFingerprint(ir: IrProgram, options: CompileOptions): void {
  const libraries = resolveCompilerLibrarySet(options.libraries)
  const actual = libraries.fingerprint

  if (ir.librarySetFingerprint !== actual) {
    throw new Error(
      `Compiler library set fingerprint mismatch: IR uses ${ir.librarySetFingerprint}, emission uses ${actual}`
    )
  }

  const actualOptions = compilerLibraryOptionsFingerprint(libraries, options.libraryOptions)

  if (ir.libraryOptionsFingerprint !== actualOptions) {
    throw new Error(
      `Compiler library options fingerprint mismatch: IR uses ${ir.libraryOptionsFingerprint}, emission uses ${actualOptions}`
    )
  }
}
