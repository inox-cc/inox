import type {
  CompilerLibraryPackageDescriptor,
  FunctionTypeRef,
  LibraryOperationDescriptor,
  PrimitiveTypeRef,
  UnknownTypeRef
} from '../../../../compiler/extensions/types.ts'

const libraryId = 'global:conversions'
const runtimeRequirement = libraryId

export const compilerLibraryPackage: CompilerLibraryPackageDescriptor = {
  id: libraryId,
  dependencies: ['global:strings'],
  operations: [numberOperation(), stringOperation(), booleanOperation(), booleanValueOperation()],
  intrinsicBindings: [],
  runtimeRequirements: [
    {
      id: runtimeRequirement,
      dependencies: ['managed-values', 'string-bytes'],
      cPreludeIncludes: ['inox/conversions.h', 'inox/string.h'],
      capabilities: []
    }
  ]
}

function booleanOperation(): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: 'global:Boolean',
    operationId: `${libraryId}#boolean`,
    kind: 'call',
    runtimeRequirements: [runtimeRequirement],
    cExpression: 'Boolean',
    cArgumentKinds: ['runtime-value'],
    cCallStyle: 'function',
    cResultMode: 'value',
    minArgs: 1,
    maxArgs: 1,
    argumentChecks: [{ valueTypes: [], typeRef: unknownTypeRef() }],
    resultTypeRef: primitiveTypeRef('boolean', false)
  }
}

function booleanValueOperation(): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: 'global:Boolean',
    operationId: `${libraryId}#boolean-value`,
    kind: 'member-read',
    runtimeRequirements: [runtimeRequirement],
    cExpression: 'Boolean',
    resultTypeRef: booleanFunctionTypeRef()
  }
}

function booleanFunctionTypeRef(): FunctionTypeRef {
  return {
    kind: 'function',
    params: [unknownTypeRef()],
    result: primitiveTypeRef('boolean', false),
    nullable: false,
    ownership: 'value',
    traits: []
  }
}

function unknownTypeRef(): UnknownTypeRef {
  return {
    kind: 'unknown',
    nullable: false,
    ownership: 'value',
    traits: []
  }
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

function primitiveTypeRef(name: 'boolean' | 'number' | 'string', nullable: boolean): PrimitiveTypeRef {
  return {
    kind: 'primitive',
    name,
    nullable,
    ownership: 'value',
    traits: []
  }
}
