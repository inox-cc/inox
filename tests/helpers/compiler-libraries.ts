import { createCompilerLibrarySetFromDiscovered } from '../../scripts/lib/compiler-library-registry.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'

export const defaultCompilerLibrarySet = createCompilerLibrarySetFromDiscovered(
  await discoverCompilerLibraries()
)
