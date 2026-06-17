import {
  compileFile as compileFileCore,
  compileFileToCModules as compileFileToCModulesCore,
  compileGraphToIrModules as compileGraphToIrModulesCore
} from './core.ts'
import { createNodeCompilerHost } from './node-host.ts'
import type { CModuleCompileOptions, CModuleCompileResult, GraphIrCompileResult } from './core.ts'
import type { CompileOptions, FileCompileResult } from './types.ts'

export {
  compileMemoryPackageToCModules,
  compileMemoryPackageToIrModules,
  compileSource,
  compileSourceToIr,
  emitTargetFromIr,
  runCStaticChecks
} from './core.ts'

export type {
  CModuleCompileOptions,
  CModuleCompileResult,
  GraphIrCompileResult,
  MemoryCModuleCompileOptions,
  MemoryCompileOptions,
  SourceIrCompileResult
} from './core.ts'

export async function compileFile(entry: string, options: CompileOptions = {}): Promise<FileCompileResult> {
  return compileFileCore(entry, compileOptionsWithNodeHost(options))
}

export async function compileFileToCModules(
  entry: string,
  options: CModuleCompileOptions = {}
): Promise<CModuleCompileResult> {
  return compileFileToCModulesCore(entry, cModuleOptionsWithNodeHost(options))
}

export async function compileGraphToIrModules(
  entry: string,
  options: CompileOptions = {}
): Promise<GraphIrCompileResult> {
  return compileGraphToIrModulesCore(entry, compileOptionsWithNodeHost(options))
}

function compileOptionsWithNodeHost(options: CompileOptions): CompileOptions {
  const host = options.host ?? createNodeCompilerHost()

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

function cModuleOptionsWithNodeHost(options: CModuleCompileOptions): CModuleCompileOptions {
  const host = options.host ?? createNodeCompilerHost()

  return {
    target: options.target,
    callMain: options.callMain,
    budgets: options.budgets,
    capabilities: options.capabilities,
    host,
    loopBackend: options.loopBackend,
    profile: options.profile,
    random: options.random,
    tlsBackend: options.tlsBackend,
    sourceRoot: options.sourceRoot
  }
}
