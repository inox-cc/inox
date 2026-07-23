import type { CppModuleCompileOptions, CppModuleCompileResult, CppModuleTextFile, GraphIrCompileResult } from './core.ts'
import {
  compileFile as compileFileCore,
  compileFileSync as compileFileSyncCore,
  compileFileWithHostSync as compileFileWithHostSyncCore,
  compileFileToCppModuleTextsSync as compileFileToCppModuleTextsSyncCore,
  compileFileToCppModuleTextsWithHostSync as compileFileToCppModuleTextsWithHostSyncCore,
  compileFileToCppModules as compileFileToCppModulesCore,
  compileFileToCppModulesSync as compileFileToCppModulesSyncCore,
  compileFileToCppModulesWithHostSync as compileFileToCppModulesWithHostSyncCore,
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
  compileMemoryPackageToCppModules,
  compileMemoryPackageToIrModules,
  compileSource,
  compileSourceToIr,
  emitTargetFromIr,
  runCppStaticChecks
} from './core.ts'

export type {
  CppModuleCompileOptions,
  CppModuleCompileResult,
  CppModuleTextFile,
  GraphIrCompileResult,
  MemoryCppModuleCompileOptions,
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

export async function compileFileToCppModules(
  entry: string,
  options: CppModuleCompileOptions = {},
  libraryLiteralTypeInference: CompilerLibraryLiteralTypeInference | null = null
): Promise<CppModuleCompileResult> {
  return compileFileToCppModulesCore(entry, cppModuleOptionsWithNodeHost(options), libraryLiteralTypeInference)
}

export function compileFileToCppModulesSync(
  entry: string,
  options: CppModuleCompileOptions = {},
  libraryLiteralTypeInference: CompilerLibraryLiteralTypeInference | null = null
): CppModuleCompileResult {
  if (options.host !== null && typeof options.host !== 'undefined') {
    return compileFileToCppModulesSyncCore(entry, options, libraryLiteralTypeInference)
  }

  return compileFileToCppModulesWithHostSyncCore(
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

export function compileFileToCppModuleTextsSync(
  entry: string,
  options: CppModuleCompileOptions = {},
  libraryLiteralTypeInference: CompilerLibraryLiteralTypeInference | null = null
): CppModuleTextFile[] {
  if (options.host !== null && typeof options.host !== 'undefined') {
    return compileFileToCppModuleTextsSyncCore(entry, options, libraryLiteralTypeInference)
  }

  return compileFileToCppModuleTextsWithHostSyncCore(
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
    profile: options.profile
  }
}

function cppModuleOptionsWithNodeHost(options: CppModuleCompileOptions): CppModuleCompileOptions {
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
      profile: options.profile,
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
    profile: options.profile,
    sourceRoot: options.sourceRoot
  }
}
