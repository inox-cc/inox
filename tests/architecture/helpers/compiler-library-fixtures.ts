import type {
  CompilerLibraryDescriptor,
  CompilerLibrarySet,
  LibraryOperationDescriptor
} from '../../../compiler/extensions/types.ts'
import { createCompilerLibrarySet } from '../../../compiler/extensions/library-set-builder.ts'
import { compilerLibraryPackage as collectionsCompilerLibraryPackage } from '../../../stdlib/global/collections/compiler/index.ts'
import { compilerLibraryPackage as consoleCompilerLibraryPackage } from '../../../stdlib/global/console/compiler/index.ts'

/** Adds the explicitly selected console package to a synthetic library set. */
export function createCompilerLibrarySetWithConsole(
  libraries: CompilerLibraryDescriptor[]
): CompilerLibrarySet {
  return createCompilerLibrarySetWithCollections([
    { ...consoleCompilerLibraryPackage, declarations: [] },
    ...libraries
  ])
}

/** Adds the explicitly selected collections package to a synthetic library set. */
export function createCompilerLibrarySetWithCollections(
  libraries: CompilerLibraryDescriptor[]
): CompilerLibrarySet {
  const selected: CompilerLibraryDescriptor[] = [
    { ...collectionsCompilerLibraryPackage, declarations: [] }
  ]

  for (let index = 0; index < libraries.length; index = index + 1) {
    selected.push(libraries[index])
  }

  return createCompilerLibrarySet(selected)
}

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
