import type {
  CompilerLibraryPackageDescriptor,
  NominalTypeRef,
  TypeRef
} from '../../../../compiler/extensions/types.ts'

const libraryId = 'global:promise'

export const promiseNativeTypeId = `${libraryId}#Promise`

/** Creates the package-owned semantic reference for Promise<T>. */
export function promiseTypeRef(fulfilledType: TypeRef, rejectedType: TypeRef): NominalTypeRef {
  return {
    kind: 'nominal',
    typeId: promiseNativeTypeId,
    args: [fulfilledType],
    nullable: false,
    ownership: 'value',
    traits: [
      {
        traitId: 'awaitable',
        args: [fulfilledType, rejectedType]
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
      typeId: promiseNativeTypeId,
      declarationNames: ['Promise'],
      valueType: 'promise',
      cppType: 'inox::Promise',
      baseTypeIds: [],
      runtimeRequirements: ['async-runtime', 'managed-values']
    }
  ],
  operations: [],
  intrinsicBindings: [],
  runtimeRequirements: []
}
