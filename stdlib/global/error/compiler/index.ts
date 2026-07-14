import type { CompilerLibraryPackageDescriptor, NominalTypeRef } from '../../../../compiler/extensions/types.ts'

const libraryId = 'global:error'

export const errorNativeTypeId = `${libraryId}#Error`

/** Creates the package-owned semantic reference for Error values. */
export function errorTypeRef(): NominalTypeRef {
  return {
    kind: 'nominal',
    typeId: errorNativeTypeId,
    args: [],
    nullable: false,
    ownership: 'value',
    traits: []
  }
}

export const compilerLibraryPackage: CompilerLibraryPackageDescriptor = {
  id: libraryId,
  dependencies: [],
  nativeTypes: [
    {
      libraryId,
      typeId: errorNativeTypeId,
      declarationNames: ['Error'],
      valueType: 'error',
      cppType: 'inox::Value',
      baseTypeIds: [],
      runtimeRequirements: ['managed-values', 'objects', 'string-bytes'],
      fields: [
        { name: 'name', valueType: 'string', readonly: true },
        { name: 'message', valueType: 'string', readonly: true },
        { name: 'code', valueType: 'string', readonly: true },
        { name: 'cause', valueType: 'object', nullable: true, readonly: true }
      ]
    }
  ],
  operations: [],
  intrinsicBindings: [],
  runtimeRequirements: []
}
