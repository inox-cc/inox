import type { CompilerLibraryDescriptor } from '../../../compiler/extensions/types.ts'

export function compilerLibrary(
  id: string,
  dependencies: string[] = []
): CompilerLibraryDescriptor {
  return {
    id,
    dependencies,
    declarations: [],
    nativeTypes: [],
    operations: [],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}
