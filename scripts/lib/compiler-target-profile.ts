import type {
  CompilerLibraryOptionValue,
  LibraryOptionDescriptor
} from '../../compiler/extensions/types.ts'
import type { CliBuildPreparation } from '../../compiler/cli/build.ts'

export type CompilerTargetCMakeCacheEntry = {
  name: string
  value: string
}

export type CompilerTargetCMakeOptionMapping = {
  optionId: string
  cacheName: string
}

export type CompilerTargetProfile = {
  optionDescriptors: LibraryOptionDescriptor[]
  optionValues: CompilerLibraryOptionValue[]
  cmakeCacheEntries: CompilerTargetCMakeCacheEntry[]
}

const targetId = 'target:runtime'
const loopBackendOptionId = `${targetId}#loop-backend`
const tlsBackendOptionId = `${targetId}#tls-backend`

export const compilerTargetCMakeOptionMappings: CompilerTargetCMakeOptionMapping[] = [
  { optionId: loopBackendOptionId, cacheName: 'INOX_LOOP_BACKEND' },
  { optionId: tlsBackendOptionId, cacheName: 'INOX_TLS_BACKEND' }
]

export const defaultCompilerTargetOptions: LibraryOptionDescriptor[] = [
  {
    libraryId: targetId,
    optionId: loopBackendOptionId,
    cliAliases: ['--loop-backend'],
    valueType: 'string',
    defaultValue: 'embedded',
    automaticStringValue: 'libuv',
    allowedValues: ['embedded', 'libuv']
  },
  {
    libraryId: targetId,
    optionId: tlsBackendOptionId,
    cliAliases: ['--tls-backend'],
    valueType: 'string',
    defaultValue: 'none',
    automaticStringValue: 'boringssl',
    allowedValues: ['none', 'boringssl', 'openssl']
  }
]

export const compilerTargetBuildPreparations: CliBuildPreparation[] = [
  {
    optionId: loopBackendOptionId,
    values: ['libuv'],
    requiredPath: 'third_party/libuv/include/uv.h',
    command: 'git',
    args: ['submodule', 'update', '--init', '--recursive', '--depth', '1', '--progress', 'third_party/libuv']
  },
  {
    optionId: tlsBackendOptionId,
    values: ['boringssl'],
    requiredPath: 'third_party/boringssl/include/openssl/ssl.h',
    command: 'git',
    args: ['submodule', 'update', '--init', '--recursive', '--depth', '1', '--progress', 'third_party/boringssl']
  }
]

export const nativeCompilerTargetProfile: CompilerTargetProfile = {
  optionDescriptors: defaultCompilerTargetOptions,
  optionValues: [
    { optionId: loopBackendOptionId, value: 'libuv' },
    { optionId: tlsBackendOptionId, value: 'boringssl' }
  ],
  cmakeCacheEntries: [
    { name: 'INOX_LOOP_BACKEND', value: 'libuv' },
    { name: 'INOX_TLS_BACKEND', value: 'boringssl' }
  ]
}

export function compilerTargetCMakeConfigureArgs(profile: CompilerTargetProfile): string[] {
  const args: string[] = []

  for (let index = 0; index < profile.cmakeCacheEntries.length; index = index + 1) {
    const entry = profile.cmakeCacheEntries[index]
    args.push(`-D${entry.name}=${entry.value}`)
  }

  return args
}
