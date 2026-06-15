import { checkCCompileBudgets } from './budgets.ts'
import { checkCProfileCapabilities } from './capabilities.ts'
import { emitCBundleFromIrModules, emitCFromIr, emitCModuleFilesFromGraph } from './codegen-c.ts'
import { checkProgram } from './checker.ts'
import { collectIrModuleRecords, collectIrRuntimeRequirements, lowerHirToIr } from './ir.ts'
import { tokenize } from './lexer.ts'
import { lowerProgram } from './lower.ts'
import { createMemoryCompilerHost } from './memory-host.ts'
import { buildModuleGraph } from './module-graph.ts'
import { createNodeCompilerHost } from './node-host.ts'
import { parse } from './parser.ts'
import type { CompileOptions, CompileTarget, FileCompileResult, IrProgram, SourceCompileResult } from './types.ts'
import type { CModuleOutputFile } from './codegen-c.ts'
import type { MemoryCompilerHostOptions, MemoryCompilerSourceFile } from './memory-host.ts'

export type CModuleCompileOptions = CompileOptions & {
  sourceRoot?: string
}

export type MemoryCompileOptions = CompileOptions & MemoryCompilerHostOptions
export type MemoryCModuleCompileOptions = CModuleCompileOptions & MemoryCompilerHostOptions

export type CModuleCompileResult = {
  target: 'c'
  graph: FileCompileResult['graph']
  files: CModuleOutputFile[]
}

export type SourceIrCompileResult = {
  target: CompileTarget
  ast: SourceCompileResult['ast']
  hir: SourceCompileResult['hir']
  ir: IrProgram
}

export type GraphIrCompileResult = {
  target: CompileTarget
  graph: FileCompileResult['graph']
  irModules: ReturnType<typeof collectIrModuleRecords>
}

export function compileSource(source: string, options: CompileOptions = {}): SourceCompileResult {
  const compiled = compileSourceToIr(source, options)

  runCStaticChecks([compiled.ir], options)

  return {
    ...compiled,
    code: emitTargetFromIr(compiled.target, compiled.ir, options)
  }
}

export function compileSourceToIr(source: string, options: CompileOptions = {}): SourceIrCompileResult {
  const target = resolveCompileTarget(options)
  const tokens = tokenize(source)
  const ast = parse(tokens)
  const checked = checkProgram(ast, {
    ...options,
    target
  })
  const hir = lowerProgram(checked.ast)
  const ir = lowerHirToIr(hir)

  return {
    target,
    ast: checked.ast,
    hir,
    ir
  }
}

export function emitTargetFromIr(target: CompileTarget, ir: IrProgram, options: CompileOptions = {}): string {
  if (target === 'c') {
    return emitCFromIr(ir, {
      random: options.random
    })
  }

  throw new Error(`Unsupported target ${target}`)
}

export async function compileFile(entry: string, options: CompileOptions = {}): Promise<FileCompileResult> {
  const compiled = await compileGraphToIrModules(entry, options)

  runCStaticChecks(
    compiled.irModules.map((module) => module.ir),
    options
  )

  return {
    target: compiled.target,
    graph: compiled.graph,
    irRuntimeRequirements: collectIrRuntimeRequirements(compiled.irModules.map((module) => module.ir)),
    code: emitCBundleFromIrModules(compiled.irModules, compiled.graph.entry, {
      random: options.random
    })
  }
}

export async function compileFileToCModules(
  entry: string,
  options: CModuleCompileOptions = {}
): Promise<CModuleCompileResult> {
  const host = options.host ?? createNodeCompilerHost()
  const compiled = await compileGraphToIrModules(entry, {
    ...options,
    host,
    target: 'c'
  })

  runCStaticChecks(
    compiled.irModules.map((module) => module.ir),
    options
  )

  return {
    target: 'c',
    graph: compiled.graph,
    files: emitCModuleFilesFromGraph(compiled.graph, {
      host,
      random: options.random,
      sourceRoot: options.sourceRoot
    })
  }
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
  const target = resolveCompileTarget(options)
  const host = options.host ?? createNodeCompilerHost()
  const graph = await buildModuleGraph(entry, {
    ...options,
    host,
    target
  })

  return {
    target,
    graph,
    irModules: collectIrModuleRecords(graph)
  }
}

export function runCStaticChecks(irs: IrProgram[], options: CompileOptions = {}): void {
  checkCProfileCapabilities(irs, options)
  checkCCompileBudgets(irs, options)
}

function resolveCompileTarget(options: CompileOptions): CompileTarget {
  const target = options.target as string | undefined

  if (target == null || target === 'c') {
    return 'c'
  }

  throw new Error(`Unsupported target ${target}`)
}

function memoryCompileOptions(options: MemoryCompileOptions, host: CompileOptions['host']): CompileOptions {
  return {
    target: options.target,
    callMain: options.callMain,
    budgets: options.budgets,
    capabilities: options.capabilities,
    host,
    loopBackend: options.loopBackend,
    profile: options.profile,
    random: options.random,
    tlsBackend: options.tlsBackend
  }
}

function memoryCModuleCompileOptions(
  options: MemoryCModuleCompileOptions,
  host: CompileOptions['host']
): CModuleCompileOptions {
  const base = memoryCompileOptions(options, host)

  return {
    target: base.target,
    callMain: base.callMain,
    budgets: base.budgets,
    capabilities: base.capabilities,
    host: base.host,
    loopBackend: base.loopBackend,
    profile: base.profile,
    random: base.random,
    tlsBackend: base.tlsBackend,
    sourceRoot: options.sourceRoot
  }
}
