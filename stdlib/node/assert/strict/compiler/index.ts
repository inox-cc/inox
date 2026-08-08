import type { CompilerLibraryPackageDescriptor } from '../../../../../compiler/extensions/types.ts'
import { createAssertOperations } from '../../compiler/index.ts'

const libraryId = 'node:assert/strict'

export const compilerLibraryPackage: CompilerLibraryPackageDescriptor = {
  id: libraryId,
  dependencies: ['node:assert'],
  operations: createAssertOperations(libraryId),
  intrinsicBindings: [],
  runtimeRequirements: []
}
