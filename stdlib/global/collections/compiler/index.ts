import type {
  CompilerLibraryPackageDescriptor,
  NominalTypeRef,
  TypeRef
} from '../../../../compiler/extensions/types.ts'

const libraryId = 'global:collections'

export const arrayNativeTypeId = `${libraryId}#Array`

/** Creates the package-owned semantic reference for Array<T>. */
export function arrayTypeRef(elementType: TypeRef): NominalTypeRef {
  return {
    kind: 'nominal',
    typeId: arrayNativeTypeId,
    args: [elementType],
    nullable: false,
    ownership: 'value',
    traits: [
      {
        traitId: 'iterable',
        args: [elementType]
      }
    ]
  }
}

export const compilerLibraryPackage: CompilerLibraryPackageDescriptor = {
  id: libraryId,
  dependencies: [],
  nativeTypes: [
    {
      libraryId,
      typeId: arrayNativeTypeId,
      declarationNames: ['Array'],
      valueType: 'array',
      cppType: 'ArrayClass',
      baseTypeIds: [],
      runtimeRequirements: ['collections', 'managed-values']
    }
  ],
  operations: [],
  intrinsicBindings: [],
  runtimeRequirements: []
}
