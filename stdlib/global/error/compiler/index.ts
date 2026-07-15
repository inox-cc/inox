import type {
  CompilerLibraryPackageDescriptor,
  LibraryOperationVariantDescriptor,
  NominalTypeRef
} from '../../../../compiler/extensions/types.ts'

const libraryId = 'global:error'
const runtimeRequirement = libraryId

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
      valueType: 'object',
      cppType: 'Error',
      baseTypeIds: [],
      runtimeRequirements: [runtimeRequirement],
      fields: [
        { name: 'name', valueType: 'string', readonly: true, cMember: 'name', cppType: 'inox::String' },
        { name: 'message', valueType: 'string', readonly: true, cMember: 'message', cppType: 'inox::String' },
        { name: 'code', valueType: 'string', readonly: true, cMember: 'code', cppType: 'inox::String' },
        { name: 'cause', valueType: 'object', nullable: true, readonly: true, cMember: 'cause', cppType: 'inox::Value' }
      ]
    }
  ],
  operations: [
    {
      libraryId,
      bindingId: 'global:Error',
      operationId: `${libraryId}#construct`,
      kind: 'construct',
      runtimeRequirements: [runtimeRequirement],
      cFailureMode: 'thrown',
      minArgs: 0,
      maxArgs: 2,
      argumentChecks: [
        { valueTypes: ['string'] },
        {
          valueTypes: ['object'],
          objectLiteralFields: [
            { name: 'code', valueTypes: ['string'], optional: true },
            { name: 'cause', valueTypes: ['object', 'null'], optional: true }
          ]
        }
      ],
      variants: constructorVariants(),
      resultTypeRef: errorTypeRef(),
      cResultMode: 'value'
    }
  ],
  intrinsicBindings: [
    {
      role: 'exception-value',
      bindingId: 'global:Error'
    }
  ],
  runtimeRequirements: [
    {
      id: runtimeRequirement,
      dependencies: ['managed-values', 'objects', 'string-bytes'],
      cPreludeIncludes: ['inox/error.h'],
      capabilities: []
    }
  ]
}

function constructorVariants(): LibraryOperationVariantDescriptor[] {
  return [
    {
      minArgs: 0,
      maxArgs: 0,
      cExpression: 'Error',
      cArgumentKinds: []
    },
    {
      minArgs: 1,
      maxArgs: 1,
      cExpression: 'Error',
      cArgumentKinds: ['string-view']
    },
    {
      minArgs: 2,
      maxArgs: 2,
      cExpression: 'Error',
      cArgumentKinds: ['string-view', 'value']
    }
  ]
}
