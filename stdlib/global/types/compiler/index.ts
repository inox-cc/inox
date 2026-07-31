import type { CompilerLibraryPackageDescriptor } from '../../../../compiler/extensions/types.ts'

const libraryId = 'global:types'

export const compilerLibraryPackage: CompilerLibraryPackageDescriptor = {
  id: libraryId,
  dependencies: [],
  typeOperators: [
    {
      libraryId,
      name: 'ReturnType',
      kind: 'function-result'
    }
  ],
  operations: [],
  intrinsicBindings: [],
  runtimeRequirements: []
}
