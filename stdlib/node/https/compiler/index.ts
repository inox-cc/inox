import type {
  CompilerLibraryPackageDescriptor,
  LibraryArgumentCheckDescriptor,
  LibraryCArgumentKind,
  LibraryOperationDescriptor,
  LibraryOperationVariantDescriptor,
  TypeRef
} from '../../../../compiler/extensions/types.ts'

const libraryId = 'node:https'
const runtimeRequirement = libraryId
const runtimeRequirements = [runtimeRequirement]
const requestTypeId = 'node:http#IncomingMessage'
const clientRequestTypeId = 'node:http#ClientRequest'

const operations: LibraryOperationDescriptor[] = [clientCreateOperation('get'), clientCreateOperation('request')]

export const compilerLibraryPackage: CompilerLibraryPackageDescriptor = {
  id: libraryId,
  dependencies: ['node:http'],
  nativeTypes: [],
  operations,
  intrinsicBindings: [],
  runtimeRequirements: [
    {
      id: runtimeRequirement,
      dependencies: ['node:http'],
      cPreludeIncludes: ['inox/https.h'],
      capabilities: ['tcp'],
      optionConstraints: [
        {
          optionId: 'target:runtime#loop-backend',
          allowedValues: ['libuv'],
          diagnosticCode: 'INOX_NOT_IMPLEMENTED',
          diagnosticMessage: 'node:https is not implemented for C without libuv; select --loop-backend libuv'
        },
        {
          optionId: 'target:runtime#tls-backend',
          allowedValues: ['boringssl', 'openssl'],
          diagnosticCode: 'INOX_NOT_IMPLEMENTED',
          diagnosticMessage:
            'node:https requires --tls-backend boringssl or --tls-backend openssl in the current C++ backend'
        }
      ]
    }
  ]
}

function clientCreateOperation(name: 'get' | 'request'): LibraryOperationDescriptor {
  const callback = responseCallbackArgument()
  const options = requestOptionsArgument()

  return {
    libraryId,
    bindingId: moduleBinding(name),
    bindingAliases: [moduleBinding(`default.${name}`)],
    operationId: `${libraryId}#${name}`,
    kind: 'call',
    runtimeRequirements,
    cExpression: `https.${name}`,
    cFailureMode: 'thrown',
    minArgs: 1,
    maxArgs: 3,
    argumentChecks: [
      { valueTypes: ['string', 'object'], objectLiteralFields: options.objectLiteralFields },
      { ...callback, valueTypes: ['object', 'function'], objectLiteralFields: options.objectLiteralFields },
      callback
    ],
    variants: [
      operationVariant(1, 1, ['string-view'], {
        argumentIndex: 0,
        argumentValueTypes: ['string'],
        argumentChecks: [stringArgument()]
      }),
      operationVariant(1, 1, ['value'], {
        argumentIndex: 0,
        argumentValueTypes: ['object'],
        argumentChecks: [options],
        cArgumentAdapters: ['HttpsRequestOptions($value)']
      }),
      operationVariant(2, 2, ['value', 'runtime-callback'], {
        argumentIndex: 0,
        argumentValueTypes: ['object'],
        argumentChecks: [options, callback],
        cArgumentAdapters: ['HttpsRequestOptions($value)', ''],
        cArgumentSources: [null, { argumentIndex: 1 }],
        callbackLifetime: 'event-loop'
      }),
      operationVariant(2, 2, ['string-view', 'runtime-callback'], {
        argumentIndex: 1,
        argumentValueTypes: ['function'],
        argumentChecks: [stringArgument(), callback],
        cArgumentSources: [null, { argumentIndex: 1 }],
        callbackLifetime: 'event-loop'
      }),
      operationVariant(2, 2, ['string-view', 'value'], {
        argumentIndex: 1,
        argumentValueTypes: ['object'],
        argumentChecks: [stringArgument(), options],
        cArgumentAdapters: ['', 'HttpsRequestOptions($value)']
      }),
      operationVariant(3, 3, ['string-view', 'value', 'runtime-callback'], {
        argumentChecks: [stringArgument(), options, callback],
        cArgumentAdapters: ['', 'HttpsRequestOptions($value)', ''],
        cArgumentSources: [null, null, { argumentIndex: 2 }],
        callbackLifetime: 'event-loop'
      })
    ],
    resultTypeRef: nominalTypeRef(clientRequestTypeId),
    callbackLifetime: 'event-loop'
  }
}

type VariantOptions = {
  argumentChecks?: LibraryArgumentCheckDescriptor[]
  argumentIndex?: number
  argumentValueTypes?: string[]
  cArgumentAdapters?: string[]
  cArgumentSources?: Array<{ argumentIndex: number } | null>
  callbackLifetime?: 'call' | 'event-loop'
}

function operationVariant(
  minArgs: number,
  maxArgs: number,
  cArgumentKinds: LibraryCArgumentKind[],
  options: VariantOptions = {}
): LibraryOperationVariantDescriptor {
  return {
    minArgs,
    maxArgs,
    argumentChecks: options.argumentChecks,
    argumentIndex: options.argumentIndex,
    argumentValueTypes: options.argumentValueTypes,
    cArgumentKinds,
    cArgumentAdapters: options.cArgumentAdapters,
    cArgumentSources: options.cArgumentSources,
    callbackLifetime: options.callbackLifetime
  }
}

function nominalTypeRef(typeId: string): TypeRef {
  return {
    kind: 'nominal',
    typeId,
    args: [],
    nullable: false,
    ownership: 'value',
    traits: []
  }
}

function moduleBinding(name: string): string {
  return `${libraryId}#module:${libraryId}:${name}`
}

function stringArgument(): LibraryArgumentCheckDescriptor {
  return { valueTypes: ['string'] }
}

function responseCallbackArgument(): LibraryArgumentCheckDescriptor {
  return {
    valueTypes: ['function'],
    functionParameters: [{ name: 'response', valueType: 'object', resultTypeId: requestTypeId }],
    functionReturnType: 'void'
  }
}

function requestOptionsArgument(): LibraryArgumentCheckDescriptor {
  return {
    valueTypes: ['object'],
    objectLiteralFields: [
      { name: 'headers', valueTypes: ['object'], optional: true },
      { name: 'host', valueTypes: ['string'], optional: true },
      { name: 'hostname', valueTypes: ['string'], optional: true },
      { name: 'method', valueTypes: ['string'], optional: true },
      { name: 'path', valueTypes: ['string'], optional: true },
      { name: 'port', valueTypes: ['number'], optional: true },
      { name: 'rejectUnauthorized', valueTypes: ['boolean'], optional: true },
      { name: 'servername', valueTypes: ['string'], optional: true }
    ]
  }
}
