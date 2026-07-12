import type { CompilerLibrarySet } from './types.ts'

export const emptyCompilerLibrarySet: CompilerLibrarySet = {
  fingerprint: 'inox:library-set:v1:811c9dc5',
  declarations: [],
  operations: [],
  intrinsicBindings: [],
  runtimeRequirements: []
}

export function resolveCompilerLibrarySet(
  libraries: CompilerLibrarySet | null | undefined
): CompilerLibrarySet {
  if (libraries !== null && typeof libraries !== 'undefined') {
    return libraries
  }

  return emptyCompilerLibrarySet
}
