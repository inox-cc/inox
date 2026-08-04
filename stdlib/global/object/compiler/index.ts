import type {
  CompilerLibraryPackageDescriptor,
  LibraryOperationDescriptor,
  NominalTypeRef,
  TypeRef
} from '../../../../compiler/extensions/types.ts'

const libraryId = 'global:object'
const collectionsLibraryId = 'global:collections'
const arrayRuntimeRequirement = `${collectionsLibraryId}#array`
const arrayTypeId = `${collectionsLibraryId}#Array`
const runtimeRequirement = `${libraryId}#object`
const stringTypeRef = primitiveTypeRef('string')
const booleanTypeRef = primitiveTypeRef('boolean')
const unknownTypeRef: TypeRef = {
  kind: 'unknown',
  nullable: false,
  ownership: 'value',
  traits: []
}

export const compilerLibraryPackage: CompilerLibraryPackageDescriptor = {
  id: libraryId,
  dependencies: [collectionsLibraryId],
  operations: [
    objectOperation('keys', arrayTypeRef(stringTypeRef)),
    objectOperation('values', arrayTypeRef(unknownTypeRef)),
    objectOperation('entries', arrayTypeRef(arrayTypeRef(unknownTypeRef))),
    objectHasOwnOperation()
  ],
  intrinsicBindings: [],
  runtimeRequirements: [
    {
      id: runtimeRequirement,
      dependencies: [arrayRuntimeRequirement, 'managed-values', 'objects', 'string-bytes'],
      cPreludeIncludes: ['inox/object_global.h'],
      capabilities: []
    }
  ]
}

function objectHasOwnOperation(): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: 'global:Object.hasOwn',
    operationId: `${libraryId}#Object.hasOwn`,
    kind: 'call',
    runtimeRequirements: [runtimeRequirement],
    variants: [
      {
        minArgs: 2,
        maxArgs: 2,
        argumentIndex: 1,
        argumentValueTypes: ['string'],
        cArgumentKinds: ['runtime-value', 'string-view'],
        argumentChecks: [{ valueTypes: objectInputValueTypes() }, { valueTypes: ['string'] }]
      },
      {
        minArgs: 2,
        maxArgs: 2,
        argumentIndex: 1,
        argumentValueTypes: ['number'],
        cArgumentKinds: ['runtime-value', 'number'],
        argumentChecks: [{ valueTypes: objectInputValueTypes() }, { valueTypes: ['number'] }]
      }
    ],
    cExpression: 'Object.hasOwn',
    cFailureMode: 'thrown',
    cPreservesPendingException: true,
    cResultMode: 'value',
    resultTypeRef: booleanTypeRef,
    minArgs: 2,
    maxArgs: 2
  }
}

function objectInputValueTypes(): string[] {
  return ['boolean', 'null', 'number', 'object', 'string', 'unknown']
}

function arrayTypeRef(elementType: TypeRef): NominalTypeRef {
  return {
    kind: 'nominal',
    typeId: arrayTypeId,
    args: [elementType],
    nullable: false,
    ownership: 'value',
    traits: [{ traitId: 'iterable', args: [elementType] }]
  }
}

function objectOperation(name: string, resultTypeRef: TypeRef): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: `global:Object.${name}`,
    operationId: `${libraryId}#Object.${name}`,
    kind: 'call',
    runtimeRequirements: [runtimeRequirement],
    cExpression: `Object.${name}`,
    cArgumentKinds: ['runtime-value'],
    cFailureMode: 'thrown',
    cPreservesPendingException: true,
    cResultMode: 'value',
    resultTypeRef,
    minArgs: 1,
    maxArgs: 1,
    argumentChecks: [{ valueTypes: ['object', 'unknown'] }]
  }
}

function primitiveTypeRef(name: 'boolean' | 'string'): TypeRef {
  return {
    kind: 'primitive',
    name,
    nullable: false,
    ownership: 'value',
    traits: []
  }
}
