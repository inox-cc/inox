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
import type { CompilerLibraryLiteralTypeInference } from './extensions/types.ts'

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

export async function compileFile(
  entry: string,
  options: CompileOptions = {},
  libraryLiteralTypeInference: CompilerLibraryLiteralTypeInference | null = null
): Promise<FileCompileResult> {
  return compileFileCore(entry, compileOptionsWithNodeHost(options), libraryLiteralTypeInference)
}

export function compileFileSync(
  entry: string,
  options: CompileOptions = {},
  libraryLiteralTypeInference: CompilerLibraryLiteralTypeInference | null = null
): FileCompileResult {
  if (options.host !== null && typeof options.host !== 'undefined') {
    return compileFileSyncCore(entry, options, libraryLiteralTypeInference)
  }

  return compileFileWithHostSyncCore(
    entry,
    options,
    {
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
    libraryLiteralTypeInference
  )
}

export async function compileFileToCModules(
  entry: string,
  options: CModuleCompileOptions = {},
  libraryLiteralTypeInference: CompilerLibraryLiteralTypeInference | null = null
): Promise<CModuleCompileResult> {
  return compileFileToCModulesCore(entry, cModuleOptionsWithNodeHost(options), libraryLiteralTypeInference)
}

export function compileFileToCModulesSync(
  entry: string,
  options: CModuleCompileOptions = {},
  libraryLiteralTypeInference: CompilerLibraryLiteralTypeInference | null = null
): CModuleCompileResult {
  if (options.host !== null && typeof options.host !== 'undefined') {
    return compileFileToCModulesSyncCore(entry, options, libraryLiteralTypeInference)
  }

  return compileFileToCModulesWithHostSyncCore(
    entry,
    options,
    {
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
    libraryLiteralTypeInference
  )
}

export function compileFileToCModuleTextsSync(
  entry: string,
  options: CModuleCompileOptions = {},
  libraryLiteralTypeInference: CompilerLibraryLiteralTypeInference | null = null
): any[] {
  if (options.host !== null && typeof options.host !== 'undefined') {
    return compileFileToCModuleTextsSyncCore(entry, options, libraryLiteralTypeInference)
  }

  return compileFileToCModuleTextsWithHostSyncCore(
    entry,
    options,
    {
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
    libraryLiteralTypeInference
  )
}

export async function compileGraphToIrModules(
  entry: string,
  options: CompileOptions = {},
  libraryLiteralTypeInference: CompilerLibraryLiteralTypeInference | null = null
): Promise<GraphIrCompileResult> {
  return compileGraphToIrModulesCore(entry, compileOptionsWithNodeHost(options), libraryLiteralTypeInference)
}

export function compileGraphToIrModulesSync(
  entry: string,
  options: CompileOptions = {},
  libraryLiteralTypeInference: CompilerLibraryLiteralTypeInference | null = null
): GraphIrCompileResult {
  if (options.host !== null && typeof options.host !== 'undefined') {
    return compileGraphToIrModulesSyncCore(entry, options, libraryLiteralTypeInference)
  }

  return compileGraphToIrModulesWithHostSyncCore(
    entry,
    options,
    {
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
    libraryLiteralTypeInference
  )
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
    libraryOptions: options.libraryOptions,
    loopBackend: options.loopBackend,
    profile: options.profile,
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
      libraryOptions: options.libraryOptions,
      loopBackend: options.loopBackend,
      profile: options.profile,
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
    libraryOptions: options.libraryOptions,
    loopBackend: options.loopBackend,
    profile: options.profile,
    tlsBackend: options.tlsBackend,
    sourceRoot: options.sourceRoot
  }
}
