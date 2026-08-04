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
        {
          name: 'cause',
          valueType: 'unknown',
          nullable: true,
          readonly: true,
          cMember: 'cause',
          cppType: 'inox::Value'
        }
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
            {
              name: 'cause',
              valueTypes: [
                'array',
                'async-result',
                'boolean',
                'bytes',
                'class',
                'function',
                'null',
                'number',
                'object',
                'string',
                'unknown',
                'void'
              ],
              optional: true
            }
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
