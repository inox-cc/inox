import type { CompilerLibraryPackageDescriptor } from '../../../../../compiler/extensions/types.ts'
import { createFsPromiseOperations } from '../../compiler/index.ts'

export const compilerLibraryPackage: CompilerLibraryPackageDescriptor = {
  id: 'node:fs/promises',
  dependencies: ['global:error', 'global:promise', 'node:fs'],
  operations: createFsPromiseOperations(),
  intrinsicBindings: [],
  runtimeRequirements: []
}
