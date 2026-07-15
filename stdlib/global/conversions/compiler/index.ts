import type {
  CompilerLibraryPackageDescriptor,
  LibraryOperationDescriptor,
  PrimitiveTypeRef
} from '../../../../compiler/extensions/types.ts'

const libraryId = 'global:conversions'
const runtimeRequirement = libraryId

export const compilerLibraryPackage: CompilerLibraryPackageDescriptor = {
  id: libraryId,
  dependencies: ['global:strings'],
  operations: [numberOperation(), stringOperation()],
  intrinsicBindings: [],
  runtimeRequirements: [
    {
      id: runtimeRequirement,
      dependencies: ['managed-values', 'string-bytes'],
      cPreludeIncludes: ['inox/string.h'],
      capabilities: []
    }
  ]
}

function numberOperation(): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: 'global:Number',
    operationId: `${libraryId}#number`,
    kind: 'call',
    runtimeRequirements: [runtimeRequirement],
    cLowering: 'number-from-string',
    minArgs: 1,
    maxArgs: 1,
    argumentChecks: [{ valueTypes: ['string'] }],
    resultTypeRef: primitiveTypeRef('number', true),
    cResultMapping: { cppType: 'inox::Value', fields: [] }
  }
}

function stringOperation(): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: 'global:String',
    operationId: `${libraryId}#string`,
    kind: 'call',
    runtimeRequirements: [runtimeRequirement],
    cLowering: 'string-conversion',
    minArgs: 1,
    maxArgs: 1,
    argumentChecks: [
      {
        valueTypes: ['boolean', 'null', 'number', 'object', 'string', 'unknown'],
        objectMethods: [
          {
            name: 'toString',
            minArgs: 0,
            maxArgs: 0,
            returnValueTypes: ['string']
          }
        ]
      }
    ],
    resultTypeRef: primitiveTypeRef('string', false),
    cResultMapping: { cppType: 'inox::String', fields: [] }
  }
}

function primitiveTypeRef(name: 'number' | 'string', nullable: boolean): PrimitiveTypeRef {
  return {
    kind: 'primitive',
    name,
    nullable,
    ownership: 'value',
    traits: []
  }
}
