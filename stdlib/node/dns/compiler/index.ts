import type {
  CompilerLibraryPackageDescriptor,
  LibraryArgumentCheckDescriptor,
  LibraryCallbackParameterDescriptor,
  LibraryOperationDescriptor,
  LibraryOperationVariantDescriptor,
  NominalTypeRef,
  ObjectTypeRef,
  PrimitiveTypeRef
} from '../../../../compiler/extensions/types.ts'

const libraryId = 'node:dns'
const runtimeRequirement = libraryId
const runtimeRequirements = [runtimeRequirement]
const arrayTypeId = 'global:collections#Array'
const stringTypeRef = primitiveTypeRef('string')
const numberTypeRef = primitiveTypeRef('number')
const voidTypeRef = primitiveTypeRef('void')

export const lookupAddressTypeRef: ObjectTypeRef = objectTypeRef('LookupAddress', [
  { name: 'address', typeRef: stringTypeRef, readonly: true },
  { name: 'family', typeRef: numberTypeRef, readonly: true }
])
export const lookupAddressArrayTypeRef: NominalTypeRef = arrayTypeRef(lookupAddressTypeRef)
export const lookupServiceResultTypeRef: ObjectTypeRef = objectTypeRef('LookupServiceResult', [
  { name: 'hostname', typeRef: stringTypeRef, readonly: true },
  { name: 'service', typeRef: stringTypeRef, readonly: true }
])

export const compilerLibraryPackage: CompilerLibraryPackageDescriptor = {
  id: libraryId,
  dependencies: ['global:collections', 'global:error', 'global:strings'],
  operations: [lookupOperation(), lookupServiceOperation()],
  intrinsicBindings: [],
  runtimeRequirements: [
    {
      id: runtimeRequirement,
      dependencies: [
        'async-runtime',
        'callback-values',
        'global:collections#array',
        'global:strings#strings',
        'managed-values',
        'objects',
        'string-bytes'
      ],
      cPreludeIncludes: ['inox/dns.h'],
      capabilities: ['dns'],
      optionConstraints: [
        {
          optionId: 'target:runtime#loop-backend',
          allowedValues: ['libuv'],
          diagnosticCode: 'INOX_NOT_IMPLEMENTED',
          diagnosticMessage: 'node:dns is not implemented without libuv; select --loop-backend libuv'
        }
      ]
    }
  ]
}

function lookupOperation(): LibraryOperationDescriptor {
  const callback = lookupCallbackArgument()
  const options = lookupOptionsArgument()

  return {
    libraryId,
    bindingId: moduleBinding(libraryId, 'lookup'),
    bindingAliases: [moduleBinding(libraryId, 'default.lookup')],
    operationId: `${libraryId}#lookup`,
    kind: 'call',
    runtimeRequirements,
    cExpression: 'dns.lookup',
    cFailureMode: 'thrown',
    minArgs: 2,
    maxArgs: 3,
    argumentChecks: [stringArgument(), { ...callback, valueTypes: ['number', 'object', 'function'] }, callback],
    variants: [
      variant(2, ['string-view', 'runtime-callback'], [stringArgument(), callback], {
        callbackLifetime: 'event-loop'
      }),
      variant(3, ['string-view', 'number', 'runtime-callback'], [stringArgument(), numberArgument(), callback], {
        argumentIndex: 1,
        argumentValueTypes: ['number'],
        callbackLifetime: 'event-loop'
      }),
      variant(
        3,
        ['string-view', 'value', 'runtime-callback'],
        [stringArgument(), lookupAllOptionsArgument(), lookupAllCallbackArgument()],
        {
          argumentIndex: 1,
          argumentValueTypes: ['object'],
          objectFieldName: 'all',
          booleanLiterals: [true],
          cArgumentAdapters: ['', 'DnsLookupOptions($value)', ''],
          callbackLifetime: 'event-loop'
        }
      ),
      variant(3, ['string-view', 'value', 'runtime-callback'], [stringArgument(), options, callback], {
        argumentIndex: 1,
        argumentValueTypes: ['object'],
        cArgumentAdapters: ['', 'DnsLookupOptions($value)', ''],
        callbackLifetime: 'event-loop'
      })
    ],
    resultTypeRef: voidTypeRef,
    callbackLifetime: 'event-loop'
  }
}

function lookupServiceOperation(): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: moduleBinding(libraryId, 'lookupService'),
    bindingAliases: [moduleBinding(libraryId, 'default.lookupService')],
    operationId: `${libraryId}#lookupService`,
    kind: 'call',
    runtimeRequirements,
    cExpression: 'dns.lookupService',
    cArgumentKinds: ['string-view', 'number', 'runtime-callback'],
    cFailureMode: 'thrown',
    minArgs: 3,
    maxArgs: 3,
    argumentChecks: [stringArgument(), numberArgument(), lookupServiceCallbackArgument()],
    resultTypeRef: voidTypeRef,
    callbackLifetime: 'event-loop'
  }
}

type VariantOptions = Pick<
  LibraryOperationVariantDescriptor,
  | 'argumentIndex'
  | 'argumentValueTypes'
  | 'booleanLiterals'
  | 'callbackLifetime'
  | 'cArgumentAdapters'
  | 'objectFieldName'
>

function variant(
  argumentCount: number,
  cArgumentKinds: LibraryOperationVariantDescriptor['cArgumentKinds'],
  argumentChecks: LibraryArgumentCheckDescriptor[],
  options: Partial<VariantOptions> = {}
): LibraryOperationVariantDescriptor {
  return {
    minArgs: argumentCount,
    maxArgs: argumentCount,
    cArgumentKinds,
    argumentChecks,
    ...options
  }
}

function lookupCallbackArgument(): LibraryArgumentCheckDescriptor {
  return callbackArgument([
    errorCallbackParameter(),
    { name: 'address', valueType: 'string' },
    { name: 'family', valueType: 'number' }
  ])
}

function lookupAllCallbackArgument(): LibraryArgumentCheckDescriptor {
  return callbackArgument([
    errorCallbackParameter(),
    { name: 'addresses', valueType: 'array', typeRef: lookupAddressArrayTypeRef }
  ])
}

function lookupServiceCallbackArgument(): LibraryArgumentCheckDescriptor {
  return callbackArgument([
    errorCallbackParameter(),
    { name: 'hostname', valueType: 'string' },
    { name: 'service', valueType: 'string' }
  ])
}

function errorCallbackParameter(): LibraryCallbackParameterDescriptor {
  return {
    name: 'error',
    valueType: 'object',
    nullable: true,
    shapeFields: [{ name: 'message', valueType: 'string', readonly: true }]
  }
}

function callbackArgument(parameters: LibraryCallbackParameterDescriptor[]): LibraryArgumentCheckDescriptor {
  return {
    valueTypes: ['function'],
    functionParameters: parameters,
    functionReturnType: 'void'
  }
}

function lookupOptionsArgument(): LibraryArgumentCheckDescriptor {
  return {
    valueTypes: ['object'],
    objectLiteralFields: [
      { name: 'family', valueTypes: ['number'], optional: true },
      { name: 'all', valueTypes: ['boolean'], booleanLiterals: [false, true], optional: true },
      {
        name: 'order',
        valueTypes: ['string'],
        stringLiterals: ['verbatim', 'ipv4first', 'ipv6first'],
        optional: true
      }
    ]
  }
}

function lookupAllOptionsArgument(): LibraryArgumentCheckDescriptor {
  const options = lookupOptionsArgument()

  return {
    ...options,
    objectLiteralFields: options.objectLiteralFields?.map((field) =>
      field.name === 'all' ? { ...field, booleanLiterals: [true], optional: false } : field
    )
  }
}

function arrayTypeRef(elementTypeRef: ObjectTypeRef): NominalTypeRef {
  return {
    kind: 'nominal',
    typeId: arrayTypeId,
    args: [elementTypeRef],
    nullable: false,
    ownership: 'value',
    traits: [{ traitId: 'iterable', args: [elementTypeRef] }]
  }
}

function objectTypeRef(name: string, fields: ObjectTypeRef['fields']): ObjectTypeRef {
  return {
    kind: 'object',
    declaredName: name,
    fields,
    dynamic: false,
    nullable: false,
    ownership: 'value',
    traits: []
  }
}

function stringArgument(): LibraryArgumentCheckDescriptor {
  return { valueTypes: ['string'] }
}

function numberArgument(): LibraryArgumentCheckDescriptor {
  return { valueTypes: ['number'] }
}

function primitiveTypeRef(name: 'number' | 'string' | 'void'): PrimitiveTypeRef {
  return { kind: 'primitive', name, nullable: false, ownership: 'value', traits: [] }
}

export function moduleBinding(ownerLibraryId: string, name: string): string {
  return `${ownerLibraryId}#module:${ownerLibraryId}:${name}`
}
