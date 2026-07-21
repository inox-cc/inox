import type { CompilerLibraryPackageDescriptor } from '../../../../compiler/extensions/types.ts'

const libraryId = 'global:platform'

export const compilerLibraryPackage: CompilerLibraryPackageDescriptor = {
  id: libraryId,
  dependencies: [],
  options: [
    {
      libraryId,
      optionId: `${libraryId}#loop-backend`,
      cliAliases: ['--loop-backend'],
      valueType: 'string',
      defaultValue: 'embedded',
      allowedValues: ['embedded', 'libuv']
    },
    {
      libraryId,
      optionId: `${libraryId}#tls-backend`,
      cliAliases: ['--tls-backend'],
      valueType: 'string',
      defaultValue: 'none',
      allowedValues: ['none', 'boringssl', 'openssl']
    }
  ],
  operations: [],
  intrinsicBindings: [],
  runtimeRequirements: []
}
