import type { CModuleCompileOptions, CModuleCompileResult, GraphIrCompileResult } from './core.ts'
import {
  compileFile as compileFileCore,
  compileFileSync as compileFileSyncCore,
  compileFileWithHostSync as compileFileWithHostSyncCore,
  compileFileToCModuleTextsSync as compileFileToCModuleTextsSyncCore,
  compileFileToCModuleTextsWithHostSync as compileFileToCModuleTextsWithHostSyncCore,
  compileFileToCModules as compileFileToCModulesCore,
  compileFileToCModulesSync as compileFileToCModulesSyncCore,
  compileFileToCModulesWithHostSync as compileFileToCModulesWithHostSyncCore,
  compileGraphToIrModules as compileGraphToIrModulesCore,
  compileGraphToIrModulesSync as compileGraphToIrModulesSyncCore,
  compileGraphToIrModulesWithHostSync as compileGraphToIrModulesWithHostSyncCore
} from './core.ts'
import {
  basenameNodePosixPath,
  createNodeCompilerHost,
  dirnameNodeCompilerHost,
  dirnameNodePosixPath,
  extnameNodeCompilerHost,
  extnameNodePosixPath,
  isAbsoluteNodeCompilerHost,
  joinNodeCompilerHost,
  normalizeNodeCompilerHost,
  pathToFileUrlNodeCompilerHost,
  readFileNodeCompilerHost,
  readFileSyncNodeCompilerHost,
  relativeNodeCompilerHost,
  relativeNodePosixPath,
  resolveNodeCompilerHost,
  shortHashNodeCompilerHost
} from './node-host.ts'
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

export function compileFileSync(entry: string, options: CompileOptions = {}): FileCompileResult {
  if (options.host !== null && typeof options.host !== 'undefined') {
    return compileFileSyncCore(entry, options)
  }

  return compileFileWithHostSyncCore(entry, options, {
    pathSeparator: '/',
    posixPath: {
      basename: basenameNodePosixPath,
      dirname: dirnameNodePosixPath,
      extname: extnameNodePosixPath,
      relative: relativeNodePosixPath
    },
    dirname: dirnameNodeCompilerHost,
    extname: extnameNodeCompilerHost,
    isAbsolutePath: isAbsoluteNodeCompilerHost,
    joinPath: joinNodeCompilerHost,
    normalizePath: normalizeNodeCompilerHost,
    pathToFileUrl: pathToFileUrlNodeCompilerHost,
    readFile: readFileNodeCompilerHost,
    readFileSync: readFileSyncNodeCompilerHost,
    relativePath: relativeNodeCompilerHost,
    resolvePath: resolveNodeCompilerHost,
    shortHash: shortHashNodeCompilerHost
  })
}

export async function compileFileToCModules(
  entry: string,
  options: CModuleCompileOptions = {}
): Promise<CModuleCompileResult> {
  return compileFileToCModulesCore(entry, cModuleOptionsWithNodeHost(options))
}

export function compileFileToCModulesSync(
  entry: string,
  options: CModuleCompileOptions = {}
): CModuleCompileResult {
  if (options.host !== null && typeof options.host !== 'undefined') {
    return compileFileToCModulesSyncCore(entry, options)
  }

  return compileFileToCModulesWithHostSyncCore(entry, options, {
    pathSeparator: '/',
    posixPath: {
      basename: basenameNodePosixPath,
      dirname: dirnameNodePosixPath,
      extname: extnameNodePosixPath,
      relative: relativeNodePosixPath
    },
    dirname: dirnameNodeCompilerHost,
    extname: extnameNodeCompilerHost,
    isAbsolutePath: isAbsoluteNodeCompilerHost,
    joinPath: joinNodeCompilerHost,
    normalizePath: normalizeNodeCompilerHost,
    pathToFileUrl: pathToFileUrlNodeCompilerHost,
    readFile: readFileNodeCompilerHost,
    readFileSync: readFileSyncNodeCompilerHost,
    relativePath: relativeNodeCompilerHost,
    resolvePath: resolveNodeCompilerHost,
    shortHash: shortHashNodeCompilerHost
  })
}

export function compileFileToCModuleTextsSync(
  entry: string,
  options: CModuleCompileOptions = {}
): any[] {
  if (options.host !== null && typeof options.host !== 'undefined') {
    return compileFileToCModuleTextsSyncCore(entry, options)
  }

  return compileFileToCModuleTextsWithHostSyncCore(entry, options, {
    pathSeparator: '/',
    posixPath: {
      basename: basenameNodePosixPath,
      dirname: dirnameNodePosixPath,
      extname: extnameNodePosixPath,
      relative: relativeNodePosixPath
    },
    dirname: dirnameNodeCompilerHost,
    extname: extnameNodeCompilerHost,
    isAbsolutePath: isAbsoluteNodeCompilerHost,
    joinPath: joinNodeCompilerHost,
    normalizePath: normalizeNodeCompilerHost,
    pathToFileUrl: pathToFileUrlNodeCompilerHost,
    readFile: readFileNodeCompilerHost,
    readFileSync: readFileSyncNodeCompilerHost,
    relativePath: relativeNodeCompilerHost,
    resolvePath: resolveNodeCompilerHost,
    shortHash: shortHashNodeCompilerHost
  })
}

export async function compileGraphToIrModules(
  entry: string,
  options: CompileOptions = {}
): Promise<GraphIrCompileResult> {
  return compileGraphToIrModulesCore(entry, compileOptionsWithNodeHost(options))
}

export function compileGraphToIrModulesSync(entry: string, options: CompileOptions = {}): GraphIrCompileResult {
  if (options.host !== null && typeof options.host !== 'undefined') {
    return compileGraphToIrModulesSyncCore(entry, options)
  }

  return compileGraphToIrModulesWithHostSyncCore(entry, options, {
    pathSeparator: '/',
    posixPath: {
      basename: basenameNodePosixPath,
      dirname: dirnameNodePosixPath,
      extname: extnameNodePosixPath,
      relative: relativeNodePosixPath
    },
    dirname: dirnameNodeCompilerHost,
    extname: extnameNodeCompilerHost,
    isAbsolutePath: isAbsoluteNodeCompilerHost,
    joinPath: joinNodeCompilerHost,
    normalizePath: normalizeNodeCompilerHost,
    pathToFileUrl: pathToFileUrlNodeCompilerHost,
    readFile: readFileNodeCompilerHost,
    readFileSync: readFileSyncNodeCompilerHost,
    relativePath: relativeNodeCompilerHost,
    resolvePath: resolveNodeCompilerHost,
    shortHash: shortHashNodeCompilerHost
  })
}

function compileOptionsWithNodeHost(options: CompileOptions): CompileOptions {
  const host = options.host ?? createNodeCompilerHost()

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

function cModuleOptionsWithNodeHost(options: CModuleCompileOptions): CModuleCompileOptions {
  if (options.host !== null && typeof options.host !== 'undefined') {
    return {
      target: options.target,
      callMain: options.callMain,
      budgets: options.budgets,
      capabilities: options.capabilities,
      declarationImports: options.declarationImports,
      host: options.host,
      libraries: options.libraries,
      loopBackend: options.loopBackend,
      profile: options.profile,
      random: options.random,
      tlsBackend: options.tlsBackend,
      sourceRoot: options.sourceRoot
    }
  }

  return {
    target: options.target,
    callMain: options.callMain,
    budgets: options.budgets,
    capabilities: options.capabilities,
    declarationImports: options.declarationImports,
    host: {
      pathSeparator: '/',
      posixPath: {
        basename: basenameNodePosixPath,
        dirname: dirnameNodePosixPath,
        extname: extnameNodePosixPath,
        relative: relativeNodePosixPath
      },
      dirname: dirnameNodeCompilerHost,
      extname: extnameNodeCompilerHost,
      isAbsolutePath: isAbsoluteNodeCompilerHost,
      joinPath: joinNodeCompilerHost,
      normalizePath: normalizeNodeCompilerHost,
      pathToFileUrl: pathToFileUrlNodeCompilerHost,
      readFile: readFileNodeCompilerHost,
      readFileSync: readFileSyncNodeCompilerHost,
      relativePath: relativeNodeCompilerHost,
      resolvePath: resolveNodeCompilerHost,
      shortHash: shortHashNodeCompilerHost
    },
    libraries: options.libraries,
    loopBackend: options.loopBackend,
    profile: options.profile,
    random: options.random,
    tlsBackend: options.tlsBackend,
    sourceRoot: options.sourceRoot
  }
}
