import type {
  CompilerLibraryDescriptor,
  LibraryOperationDescriptor
} from '../../../compiler/extensions/types.ts'

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

export function globalDeclarationLibrary(
  id: string,
  declarationSource: string,
  operations: LibraryOperationDescriptor[] = []
): CompilerLibraryDescriptor {
  return {
    id,
    dependencies: [],
    declarations: [
      {
        libraryId: id,
        kind: 'global',
        source: `stdlib/${id.replace(':', '/')}/index.d.ts`,
        declarationSource,
        compilerImplemented: true
      }
    ],
    nativeTypes: [],
    operations,
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}
