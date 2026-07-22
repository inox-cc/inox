import type {
  CompilerLibraryOptionValue,
  LibraryOptionDescriptor
} from '../../compiler/extensions/types.ts'

export type CompilerTargetCMakeCacheEntry = {
  name: string
  value: string
}

export type CompilerTargetProfile = {
  optionDescriptors: LibraryOptionDescriptor[]
  optionValues: CompilerLibraryOptionValue[]
  cmakeCacheEntries: CompilerTargetCMakeCacheEntry[]
}

const targetId = 'target:runtime'
const loopBackendOptionId = `${targetId}#loop-backend`
const tlsBackendOptionId = `${targetId}#tls-backend`

export const defaultCompilerTargetOptions: LibraryOptionDescriptor[] = [
  {
    libraryId: targetId,
    optionId: loopBackendOptionId,
    cliAliases: ['--loop-backend'],
    valueType: 'string',
    defaultValue: 'embedded',
    allowedValues: ['embedded', 'libuv']
  },
  {
    libraryId: targetId,
    optionId: tlsBackendOptionId,
    cliAliases: ['--tls-backend'],
    valueType: 'string',
    defaultValue: 'none',
    allowedValues: ['none', 'boringssl', 'openssl']
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
