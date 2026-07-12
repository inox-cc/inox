import { checkCCompileBudgets } from './budgets.ts'
import type { CEmitOptions, CModuleEmitOptions } from './c/types.ts'
import { checkCProfileCapabilities } from './capabilities.ts'
import { checkProgram } from './checker.ts'
import { emitCBundleFromIrModules, emitCFromIr, emitCModuleFilesFromGraph } from './codegen-c.ts'
import type { CompilerHost } from './host.ts'
import { resolveCompilerLibrarySet } from './extensions/library-set.ts'
import type { CompilerLibrarySet } from './extensions/types.ts'
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
  RandomOptions,
  RuntimeBudgets,
  RuntimeCapabilities,
  RuntimeLoopBackend,
  RuntimeProfile,
  SourceCompileResult,
  TlsBackend
} from './types.ts'

export type CModuleCompileOptions = {
  target?: CompileTarget
  callMain?: boolean
  budgets?: RuntimeBudgets
  capabilities?: RuntimeCapabilities
  declarationImports?: ModuleDeclarationImport[]
  host?: CompilerHost
  libraries?: CompilerLibrarySet
  loopBackend?: RuntimeLoopBackend
  profile?: RuntimeProfile
  random?: RandomOptions
  tlsBackend?: TlsBackend
  sourceRoot?: string
}

export type MemoryCompileOptions = {
  target?: CompileTarget
  callMain?: boolean
  budgets?: RuntimeBudgets
  capabilities?: RuntimeCapabilities
  declarationImports?: ModuleDeclarationImport[]
  libraries?: CompilerLibrarySet
  loopBackend?: RuntimeLoopBackend
  profile?: RuntimeProfile
  random?: RandomOptions
  root?: string
  tlsBackend?: TlsBackend
}

export type MemoryCModuleCompileOptions = {
  target?: CompileTarget
  callMain?: boolean
  budgets?: RuntimeBudgets
  capabilities?: RuntimeCapabilities
  declarationImports?: ModuleDeclarationImport[]
  libraries?: CompilerLibrarySet
  loopBackend?: RuntimeLoopBackend
  profile?: RuntimeProfile
  random?: RandomOptions
  root?: string
  tlsBackend?: TlsBackend
  sourceRoot?: string
}

export type CModuleCompileResult = {
  target: 'cc'
  graph: ModuleGraph
  files: any[]
}

type CModuleTextFile = {
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

export function compileSource(source: string, options: CompileOptions = {}): SourceCompileResult {
  const compiled = compileSourceToIr(source, options)

  runCStaticChecks([compiled.ir], options)

  return {
    target: compiled.target,
    ast: compiled.ast,
    hir: compiled.hir,
    ir: compiled.ir,
    code: emitTargetFromIr(compiled.target, compiled.ir, options)
  }
}

export function compileSourceToIr(source: string, options: CompileOptions = {}): SourceIrCompileResult {
  const target = resolveCompileTarget(options)
  const libraries = resolveCompilerLibrarySet(options.libraries)
  const tokens = tokenize(source, {})
  const ast = parse(tokens)
  const checked = checkProgram(ast, compileOptionsWithTargetAndLibraries(options, target, libraries))
  const hir = lowerProgram(checked.ast)
  const ir = lowerHirToIr(hir, libraries.fingerprint)

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
    const emitOptions: CEmitOptions = options

    return emitCFromIr(ir, emitOptions)
  }

  throw new Error(`Unsupported target ${target}`)
}

export async function compileFile(entry: string, options: CompileOptions = {}): Promise<FileCompileResult> {
  const compiled = await compileGraphToIrModules(entry, options)

  return emitFileCompileResult(compiled, options)
}

export function compileFileSync(entry: string, options: CompileOptions = {}): FileCompileResult {
  const compiled = compileGraphToIrModulesSync(entry, options)

  return emitFileCompileResult(compiled, options)
}

export function compileFileWithHostSync(entry: string, options: CompileOptions, host: CompilerHost): FileCompileResult {
  const compiled = compileGraphToIrModulesWithHostSync(entry, options, host)

  return emitFileCompileResult(compiled, compileOptionsWithHostAndTarget(options, host, compiled.target))
}

function emitFileCompileResult(compiled: GraphIrCompileResult, options: CompileOptions): FileCompileResult {
  const irModules: IrProgram[] = []

  for (let moduleIndex = 0; moduleIndex < compiled.irModules.length; moduleIndex = moduleIndex + 1) {
    const module = compiled.irModules[moduleIndex]

    irModules.push(module.ir)
  }

  runCStaticChecks(irModules, options)
  const code = emitCBundleFromIrModules(compiled.irModules, compiled.graph.entry, options)

  return {
    target: compiled.target,
    graph: compiled.graph,
    irRuntimeRequirements: collectIrRuntimeRequirements(irModules),
    code
  }
}

export async function compileFileToCModules(
  entry: string,
  options: CModuleCompileOptions = {}
): Promise<CModuleCompileResult> {
  return compileFileToCModulesSync(entry, options)
}

export function compileFileToCModulesSync(entry: string, options: CModuleCompileOptions = {}): CModuleCompileResult {
  if (options.host === null || typeof options.host === 'undefined') {
    throw new Error('compileFileToCModules requires a compiler host')
  }

  return compileFileToCModulesWithHostSync(entry, options, options.host)
}

export function compileFileToCModulesWithHostSync(
  entry: string,
  options: CModuleCompileOptions,
  host: CompilerHost
): CModuleCompileResult {
  const compiled = compileGraphToIrModulesWithHostSync(entry, cModuleOptionsWithHostAndTarget(options, host, 'cc'), host)
  const irModules: IrProgram[] = []

  for (let moduleIndex = 0; moduleIndex < compiled.irModules.length; moduleIndex = moduleIndex + 1) {
    const module = compiled.irModules[moduleIndex]

    irModules.push(module.ir)
  }

  runCStaticChecks(irModules, options)

  const emitOptions: CModuleEmitOptions = {
    callMain: options.callMain,
    host,
    libraries: options.libraries,
    random: options.random,
    sourceRoot: options.sourceRoot
  }

  return {
    target: 'cc',
    graph: compiled.graph,
    files: emitCModuleFilesFromGraph(compiled.graph, emitOptions)
  }
}

export function compileFileToCModuleTextsSync(
  entry: string,
  options: CModuleCompileOptions = {}
): any[] {
  if (options.host === null || typeof options.host === 'undefined') {
    throw new Error('compileFileToCModuleTexts requires a compiler host')
  }

  return compileFileToCModuleTextsWithHostSync(entry, options, options.host)
}

export function compileFileToCModuleTextsWithHostSync(
  entry: string,
  options: CModuleCompileOptions,
  host: CompilerHost
): any[] {
  const compiled = compileGraphToIrModulesWithHostSync(entry, cModuleOptionsWithHostAndTarget(options, host, 'cc'), host)
  const irModules: IrProgram[] = []

  for (let moduleIndex = 0; moduleIndex < compiled.irModules.length; moduleIndex = moduleIndex + 1) {
    const module = compiled.irModules[moduleIndex]

    irModules.push(module.ir)
  }

  runCStaticChecks(irModules, options)

  const emitOptions: CModuleEmitOptions = {
    callMain: options.callMain,
    host,
    libraries: options.libraries,
    random: options.random,
    sourceRoot: options.sourceRoot
  }
  const files: CModuleTextFile[] = emitCModuleFilesFromGraph(compiled.graph, emitOptions)
  const texts: CModuleTextFile[] = []

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
  options: MemoryCompileOptions = {}
): Promise<GraphIrCompileResult> {
  const host = createMemoryCompilerHost(files, { root: options.root })

  return compileGraphToIrModules(entry, memoryCompileOptions(options, host))
}

export async function compileMemoryPackageToCModules(
  entry: string,
  files: MemoryCompilerSourceFile[],
  options: MemoryCModuleCompileOptions = {}
): Promise<CModuleCompileResult> {
  const host = createMemoryCompilerHost(files, { root: options.root })

  return compileFileToCModules(entry, memoryCModuleCompileOptions(options, host))
}

export async function compileGraphToIrModules(
  entry: string,
  options: CompileOptions = {}
): Promise<GraphIrCompileResult> {
  return compileGraphToIrModulesSync(entry, options)
}

export function compileGraphToIrModulesSync(entry: string, options: CompileOptions = {}): GraphIrCompileResult {
  if (options.host === null || typeof options.host === 'undefined') {
    throw new Error('compileGraphToIrModules requires a compiler host')
  }

  return compileGraphToIrModulesWithHostSync(entry, options, options.host)
}

export function compileGraphToIrModulesWithHostSync(
  entry: string,
  options: CompileOptions,
  host: CompilerHost
): GraphIrCompileResult {
  const target = resolveCompileTarget(options)
  const graph = buildModuleGraphWithHostSync(entry, compileOptionsWithHostAndTarget(options, host, target), host)
  const irModules = collectIrModuleRecords(graph)

  return {
    target,
    graph,
    irModules
  }
}

export function runCStaticChecks(irs: IrProgram[], options: CompileOptions = {}): void {
  for (let index = 0; index < irs.length; index = index + 1) {
    assertIrLibrarySetFingerprint(irs[index], options)
  }

  checkCProfileCapabilities(irs, options)
  checkCCompileBudgets(irs, options)
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
    loopBackend: options.loopBackend,
    profile: options.profile,
    random: options.random,
    tlsBackend: options.tlsBackend
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
    loopBackend: options.loopBackend,
    profile: options.profile,
    random: options.random,
    tlsBackend: options.tlsBackend
  }
}

function cModuleOptionsWithHostAndTarget(
  options: CModuleCompileOptions,
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
    loopBackend: options.loopBackend,
    profile: options.profile,
    random: options.random,
    tlsBackend: options.tlsBackend
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
    loopBackend: options.loopBackend,
    profile: options.profile,
    random: options.random,
    tlsBackend: options.tlsBackend
  }
}

function memoryCModuleCompileOptions(options: MemoryCModuleCompileOptions, host: any): CModuleCompileOptions {
  const base = memoryCompileOptions(options, host)

  return {
    target: base.target,
    callMain: base.callMain,
    budgets: base.budgets,
    capabilities: base.capabilities,
    declarationImports: base.declarationImports,
    host: base.host,
    libraries: base.libraries,
    loopBackend: base.loopBackend,
    profile: base.profile,
    random: base.random,
    tlsBackend: base.tlsBackend,
    sourceRoot: options.sourceRoot
  }
}

function assertIrLibrarySetFingerprint(ir: IrProgram, options: CompileOptions): void {
  const actual = resolveCompilerLibrarySet(options.libraries).fingerprint

  if (ir.librarySetFingerprint !== actual) {
    throw new Error(
      `Compiler library set fingerprint mismatch: IR uses ${ir.librarySetFingerprint}, emission uses ${actual}`
    )
  }
}
