import type {
  CompilerLibraryPackageDescriptor,
  LibraryArgumentCheckDescriptor,
  LibraryCallbackParameterDescriptor,
  LibraryOperationDescriptor,
  LibraryOperationVariantDescriptor,
  ObjectTypeRef,
  PrimitiveTypeRef
} from '../../../../compiler/extensions/types.ts'

const libraryId = 'node:dns'
const runtimeRequirement = libraryId
const runtimeRequirements = [runtimeRequirement]
const stringTypeRef = primitiveTypeRef('string')
const numberTypeRef = primitiveTypeRef('number')
const voidTypeRef = primitiveTypeRef('void')

export const lookupAddressTypeRef: ObjectTypeRef = {
  kind: 'object',
  declaredName: 'LookupAddress',
  fields: [
    { name: 'address', typeRef: stringTypeRef, readonly: true },
    { name: 'family', typeRef: numberTypeRef, readonly: true }
  ],
  dynamic: false,
  nullable: false,
  ownership: 'value',
  traits: []
}

export const compilerLibraryPackage: CompilerLibraryPackageDescriptor = {
  id: libraryId,
  dependencies: ['global:error', 'global:strings'],
  operations: [lookupOperation()],
  intrinsicBindings: [],
  runtimeRequirements: [
    {
      id: runtimeRequirement,
      dependencies: [
        'async-runtime',
        'callback-values',
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

type VariantOptions = Pick<
  LibraryOperationVariantDescriptor,
  'argumentIndex' | 'argumentValueTypes' | 'cArgumentAdapters' | 'callbackLifetime'
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
    {
      name: 'error',
      valueType: 'object',
      nullable: true,
      shapeFields: [{ name: 'message', valueType: 'string', readonly: true }]
    },
    { name: 'address', valueType: 'string' },
    { name: 'family', valueType: 'number' }
  ])
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
    objectLiteralFields: [{ name: 'family', valueTypes: ['number'], optional: true }]
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
