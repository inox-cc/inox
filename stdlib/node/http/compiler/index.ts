import type {
  CompilerLibraryPackageDescriptor,
  LibraryArgumentCheckDescriptor,
  LibraryCArgumentKind,
  LibraryCallbackParameterDescriptor,
  LibraryOperationDescriptor,
  LibraryOperationVariantDescriptor,
  NominalTypeRef,
  ObjectTypeRef,
  PrimitiveTypeRef,
  TypeRef
} from '../../../../compiler/extensions/types.ts'

const libraryId = 'node:http'
const collectionsLibraryId = 'global:collections'
const runtimeRequirement = libraryId
const arrayRuntimeRequirement = `${collectionsLibraryId}#array`
const arrayTypeId = `${collectionsLibraryId}#Array`
const serverTypeId = `${libraryId}#Server`
const requestTypeId = `${libraryId}#IncomingMessage`
const responseTypeId = `${libraryId}#ServerResponse`
const netSocketTypeId = 'node:net#Socket'
const uint8ArrayTypeId = 'global:binary#Uint8Array'
const runtimeRequirements = [runtimeRequirement]
const stringTypeRef = primitiveTypeRef('string')
const nullableStringTypeRef: PrimitiveTypeRef = { ...stringTypeRef, nullable: true }
const numberTypeRef = primitiveTypeRef('number')
const booleanTypeRef = primitiveTypeRef('boolean')
const voidTypeRef = primitiveTypeRef('void')
const headersTypeRef: ObjectTypeRef = {
  kind: 'object',
  fields: [],
  dynamic: true,
  dynamicField: nullableStringTypeRef,
  nullable: false,
  ownership: 'value',
  traits: []
}
const stringCResultMapping = cResultMapping('inox::String')
const valueCResultMapping = cResultMapping('inox::Value')

const operations: LibraryOperationDescriptor[] = [
  createServerOperation(),
  serverCloseOperation(),
  serverListenOperation(),
  serverOnOperation(),
  requestMemberReadOperation('headers', headersTypeRef, valueCResultMapping),
  requestMemberReadOperation('httpVersion', stringTypeRef, stringCResultMapping),
  requestMemberReadOperation('method', stringTypeRef, stringCResultMapping),
  requestMemberReadOperation('socket', nominalTypeRef(netSocketTypeId, 'value')),
  requestMemberReadOperation('url', stringTypeRef, stringCResultMapping),
  responseBooleanReadOperation('headersSent'),
  responseStatusReadOperation(),
  responseStatusWriteOperation(),
  responseBooleanReadOperation('writableEnded'),
  responseEndOperation(),
  responseGetHeaderOperation(),
  responseGetHeaderNamesOperation(),
  responseHasHeaderOperation(),
  responseRemoveHeaderOperation(),
  responseSetHeaderOperation(),
  responseWriteOperation(),
  responseWriteHeadOperation()
]

export const compilerLibraryPackage: CompilerLibraryPackageDescriptor = {
  id: libraryId,
  dependencies: ['global:binary', collectionsLibraryId, 'node:net'],
  nativeTypes: [
    {
      libraryId,
      typeId: serverTypeId,
      declarationNames: ['Server'],
      valueType: 'object',
      cppType: 'HttpServer',
      baseTypeIds: [],
      runtimeRequirements
    },
    {
      libraryId,
      typeId: requestTypeId,
      declarationNames: ['IncomingMessage'],
      valueType: 'object',
      cppType: 'HttpRequest',
      baseTypeIds: [],
      runtimeRequirements,
      cValueAdapter: 'HttpRequest(inox::Value($value))',
      cValueAdapterPreservesPendingException: true
    },
    {
      libraryId,
      typeId: responseTypeId,
      declarationNames: ['ServerResponse'],
      valueType: 'object',
      cppType: 'HttpResponse',
      baseTypeIds: [],
      runtimeRequirements,
      cValueAdapter: 'HttpResponse(inox::Value($value))',
      cValueAdapterPreservesPendingException: true
    }
  ],
  operations,
  intrinsicBindings: [],
  runtimeRequirements: [
    {
      id: runtimeRequirement,
      dependencies: [
        'async-runtime',
        arrayRuntimeRequirement,
        'callback-values',
        'global:binary',
        'managed-values',
        'node:net',
        'objects',
        'string-bytes'
      ],
      cPreludeIncludes: ['inox/http.h'],
      capabilities: ['tcp'],
      optionConstraints: [
        {
          optionId: 'target:runtime#loop-backend',
          allowedValues: ['libuv'],
          diagnosticCode: 'INOX_NOT_IMPLEMENTED',
          diagnosticMessage: 'node:http is not implemented for C without libuv; select --loop-backend libuv'
        }
      ]
    }
  ]
}

function createServerOperation(): LibraryOperationDescriptor {
  const callback = requestCallbackArgument()

  return {
    libraryId,
    bindingId: moduleBinding('createServer'),
    bindingAliases: [moduleBinding('default.createServer')],
    operationId: `${libraryId}#createServer`,
    kind: 'call',
    runtimeRequirements,
    cExpression: 'http.createServer',
    cFailureMode: 'thrown',
    minArgs: 0,
    maxArgs: 1,
    argumentChecks: [callback],
    variants: [
      operationVariant(0, 0, []),
      operationVariant(1, 1, ['runtime-callback'], {
        argumentChecks: [callback],
        callbackLifetime: 'event-loop'
      })
    ],
    resultTypeRef: nominalTypeRef(serverTypeId, 'value')
  }
}

function serverCloseOperation(): LibraryOperationDescriptor {
  const callback = zeroArgumentCallback()

  return {
    ...serverReceiverOperation('close'),
    minArgs: 0,
    maxArgs: 1,
    argumentChecks: [callback],
    variants: [
      serverVariant(0, 0, ['receiver']),
      serverVariant(1, 1, ['receiver', 'runtime-callback'], {
        argumentChecks: [callback],
        cArgumentSources: [null, { argumentIndex: 0 }],
        callbackLifetime: 'event-loop'
      })
    ],
    resultTypeRef: nominalTypeRef(serverTypeId, 'borrowed')
  }
}

function serverListenOperation(): LibraryOperationDescriptor {
  const callback = zeroArgumentCallback()
  const options = listenOptionsArgument()

  return {
    ...serverReceiverOperation('listen'),
    minArgs: 0,
    maxArgs: 3,
    argumentChecks: [{ valueTypes: ['number', 'object'] }, optionalStringOrCallbackArgument(), callback],
    variants: [
      serverVariant(0, 0, ['receiver']),
      serverVariant(1, 1, ['receiver', 'number'], {
        argumentIndex: 0,
        argumentValueTypes: ['number'],
        argumentChecks: [numberArgument()]
      }),
      serverVariant(1, 1, ['receiver', 'value'], {
        argumentIndex: 0,
        argumentValueTypes: ['object'],
        argumentChecks: [options],
        cArgumentAdapters: ['HttpListenOptions($value)']
      }),
      serverVariant(2, 2, ['receiver', 'number', 'string-view'], {
        argumentIndex: 1,
        argumentValueTypes: ['string'],
        argumentChecks: [numberArgument(), stringArgument()]
      }),
      serverVariant(2, 2, ['receiver', 'number', 'runtime-callback'], {
        argumentIndex: 1,
        argumentValueTypes: ['function'],
        argumentChecks: [numberArgument(), callback],
        cArgumentSources: [null, null, { argumentIndex: 1 }],
        callbackLifetime: 'event-loop'
      }),
      serverVariant(2, 2, ['receiver', 'value', 'runtime-callback'], {
        argumentIndex: 0,
        argumentValueTypes: ['object'],
        argumentChecks: [options, callback],
        cArgumentAdapters: ['HttpListenOptions($value)', ''],
        cArgumentSources: [null, null, { argumentIndex: 1 }],
        callbackLifetime: 'event-loop'
      }),
      serverVariant(3, 3, ['receiver', 'number', 'string-view', 'runtime-callback'], {
        argumentChecks: [numberArgument(), stringArgument(), callback],
        cArgumentSources: [null, null, null, { argumentIndex: 2 }],
        callbackLifetime: 'event-loop'
      })
    ],
    resultTypeRef: nominalTypeRef(serverTypeId, 'borrowed')
  }
}

function serverOnOperation(): LibraryOperationDescriptor {
  const callback = requestCallbackArgument()

  return {
    ...serverReceiverOperation('on'),
    minArgs: 2,
    maxArgs: 2,
    argumentChecks: [requestEventArgument(), callback],
    variants: [
      serverVariant(2, 2, ['receiver', 'string-view', 'runtime-callback'], {
        argumentIndex: 0,
        stringLiterals: ['request'],
        argumentChecks: [requestEventArgument(), callback],
        cArgumentSources: [null, null, { argumentIndex: 1 }],
        callbackLifetime: 'event-loop'
      })
    ],
    cResultMode: 'borrowed',
    resultTypeRef: nominalTypeRef(serverTypeId, 'borrowed'),
    callbackLifetime: 'event-loop'
  }
}

function requestMemberReadOperation(
  name: string,
  resultTypeRef: TypeRef,
  cResultMapping?: { cppType: string; fields: [] }
): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: `${requestTypeId}.${name}`,
    operationId: `${libraryId}#IncomingMessage.${name}`,
    kind: 'member-read',
    runtimeRequirements,
    receiverTypeId: requestTypeId,
    cExpression: name,
    cArgumentKinds: ['receiver'],
    cReceiverAdapter: 'HttpRequest($value)',
    cCallStyle: 'member',
    cFailureMode: 'thrown',
    resultTypeRef,
    cResultMapping
  }
}

function responseBooleanReadOperation(name: 'headersSent' | 'writableEnded'): LibraryOperationDescriptor {
  return {
    ...responseReceiverOperation(name),
    kind: 'member-read',
    cArgumentKinds: ['receiver'],
    resultTypeRef: booleanTypeRef
  }
}

function responseStatusReadOperation(): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: `${responseTypeId}.statusCode`,
    operationId: `${libraryId}#ServerResponse.statusCode.read`,
    kind: 'member-read',
    runtimeRequirements,
    receiverTypeId: responseTypeId,
    cExpression: 'statusCode',
    cArgumentKinds: ['receiver'],
    cReceiverAdapter: 'HttpResponse($value)',
    cCallStyle: 'member',
    cFailureMode: 'thrown',
    resultTypeRef: numberTypeRef
  }
}

function responseStatusWriteOperation(): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: `${responseTypeId}.statusCode`,
    operationId: `${libraryId}#ServerResponse.statusCode.write`,
    kind: 'member-write',
    runtimeRequirements,
    receiverTypeId: responseTypeId,
    cExpression: 'setStatusCode',
    cArgumentKinds: ['receiver', 'number'],
    cReceiverAdapter: 'HttpResponse($value)',
    cCallStyle: 'member',
    cFailureMode: 'thrown',
    minArgs: 1,
    maxArgs: 1,
    argumentChecks: [numberArgument()],
    resultTypeRef: numberTypeRef,
    cResultMapping: {
      cppType: 'void',
      fields: []
    }
  }
}

function responseEndOperation(): LibraryOperationDescriptor {
  return {
    ...responseReceiverOperation('end'),
    minArgs: 0,
    maxArgs: 1,
    argumentChecks: [bodyArgument()],
    variants: [operationVariant(0, 0, ['receiver']), bodyVariant('string'), bodyVariant('bytes')],
    resultTypeRef: voidTypeRef
  }
}

function responseGetHeaderOperation(): LibraryOperationDescriptor {
  return {
    ...responseReceiverOperation('getHeader'),
    cArgumentKinds: ['receiver', 'string-view'],
    minArgs: 1,
    maxArgs: 1,
    argumentChecks: [stringArgument()],
    resultTypeRef: nullableStringTypeRef,
    cResultMapping: valueCResultMapping
  }
}

function responseGetHeaderNamesOperation(): LibraryOperationDescriptor {
  return {
    ...responseReceiverOperation('getHeaderNames'),
    cArgumentKinds: ['receiver'],
    minArgs: 0,
    maxArgs: 0,
    argumentChecks: [],
    resultTypeRef: arrayTypeRef(stringTypeRef)
  }
}

function responseHasHeaderOperation(): LibraryOperationDescriptor {
  return {
    ...responseReceiverOperation('hasHeader'),
    cArgumentKinds: ['receiver', 'string-view'],
    minArgs: 1,
    maxArgs: 1,
    argumentChecks: [stringArgument()],
    resultTypeRef: booleanTypeRef
  }
}

function responseRemoveHeaderOperation(): LibraryOperationDescriptor {
  return {
    ...responseReceiverOperation('removeHeader'),
    cArgumentKinds: ['receiver', 'string-view'],
    minArgs: 1,
    maxArgs: 1,
    argumentChecks: [stringArgument()],
    resultTypeRef: voidTypeRef
  }
}

function responseSetHeaderOperation(): LibraryOperationDescriptor {
  return {
    ...responseReceiverOperation('setHeader'),
    cArgumentKinds: ['receiver', 'string-view', 'string-view'],
    minArgs: 2,
    maxArgs: 2,
    argumentChecks: [stringArgument(), stringArgument()],
    cResultMode: 'borrowed',
    resultTypeRef: nominalTypeRef(responseTypeId, 'borrowed')
  }
}

function responseWriteOperation(): LibraryOperationDescriptor {
  return {
    ...responseReceiverOperation('write'),
    minArgs: 1,
    maxArgs: 1,
    argumentChecks: [bodyArgument()],
    variants: [bodyVariant('string'), bodyVariant('bytes')],
    resultTypeRef: booleanTypeRef
  }
}

function responseWriteHeadOperation(): LibraryOperationDescriptor {
  return {
    ...responseReceiverOperation('writeHead'),
    minArgs: 1,
    maxArgs: 2,
    argumentChecks: [numberArgument(), headersArgument()],
    variants: [
      operationVariant(1, 1, ['receiver', 'number']),
      operationVariant(2, 2, ['receiver', 'number', 'value'], {
        argumentIndex: 1,
        argumentValueTypes: ['object'],
        argumentChecks: [numberArgument(), headersArgument()],
        cArgumentAdapters: ['', 'HttpHeaders($value)'],
        cResultMode: 'borrowed'
      })
    ],
    cResultMode: 'borrowed',
    resultTypeRef: nominalTypeRef(responseTypeId, 'borrowed')
  }
}

function serverReceiverOperation(name: string): LibraryOperationDescriptor {
  return receiverOperation(serverTypeId, 'Server', 'HttpServer($value)', name)
}

function responseReceiverOperation(name: string): LibraryOperationDescriptor {
  return receiverOperation(responseTypeId, 'ServerResponse', 'HttpResponse($value)', name)
}

function receiverOperation(
  receiverTypeId: string,
  receiverName: string,
  receiverAdapter: string,
  name: string
): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: `${receiverTypeId}.${name}`,
    operationId: `${libraryId}#${receiverName}.${name}`,
    kind: 'call',
    runtimeRequirements,
    receiverTypeId,
    cExpression: name,
    cReceiverAdapter: receiverAdapter,
    cCallStyle: 'member',
    cFailureMode: 'thrown'
  }
}

type VariantOptions = {
  argumentChecks?: LibraryArgumentCheckDescriptor[]
  argumentIndex?: number
  argumentValueTypes?: string[]
  stringLiterals?: string[]
  cArgumentAdapters?: string[]
  cArgumentAdapterTypeIds?: string[]
  cArgumentSources?: Array<{ argumentIndex: number } | null>
  cResultMode?: 'value' | 'borrowed'
  callbackLifetime?: 'call' | 'event-loop'
}

function serverVariant(
  minArgs: number,
  maxArgs: number,
  cArgumentKinds: LibraryCArgumentKind[],
  options: VariantOptions = {}
): LibraryOperationVariantDescriptor {
  return {
    ...operationVariant(minArgs, maxArgs, cArgumentKinds, options),
    cResultMode: 'borrowed'
  }
}

function bodyVariant(valueType: 'string' | 'bytes'): LibraryOperationVariantDescriptor {
  return operationVariant(1, 1, valueType === 'string' ? ['receiver', 'string-view'] : ['receiver', 'value'], {
    argumentIndex: 0,
    argumentValueTypes: [valueType],
    argumentChecks: [{ valueTypes: [valueType] }],
    cArgumentAdapters: valueType === 'bytes' ? ['Uint8Array($value)'] : [],
    cArgumentAdapterTypeIds: valueType === 'bytes' ? [uint8ArrayTypeId] : []
  })
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
    stringLiterals: options.stringLiterals,
    cArgumentKinds,
    cArgumentAdapters: options.cArgumentAdapters,
    cArgumentAdapterTypeIds: options.cArgumentAdapterTypeIds,
    cArgumentSources: options.cArgumentSources,
    cResultMode: options.cResultMode,
    callbackLifetime: options.callbackLifetime
  }
}

function nominalTypeRef(typeId: string, ownership: 'borrowed' | 'value'): TypeRef {
  return {
    kind: 'nominal',
    typeId,
    args: [],
    nullable: false,
    ownership,
    traits: []
  }
}

function primitiveTypeRef(name: 'boolean' | 'number' | 'string' | 'void'): PrimitiveTypeRef {
  return {
    kind: 'primitive',
    name,
    nullable: false,
    ownership: 'value',
    traits: []
  }
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

function cResultMapping(cppType: string): { cppType: string; fields: [] } {
  return { cppType, fields: [] }
}

function moduleBinding(name: string): string {
  return `${libraryId}#module:${libraryId}:${name}`
}

function stringArgument(): LibraryArgumentCheckDescriptor {
  return { valueTypes: ['string'] }
}

function numberArgument(): LibraryArgumentCheckDescriptor {
  return { valueTypes: ['number'] }
}

function bodyArgument(): LibraryArgumentCheckDescriptor {
  return { valueTypes: ['string', 'bytes'] }
}

function zeroArgumentCallback(): LibraryArgumentCheckDescriptor {
  return callbackArgument([])
}

function requestCallbackArgument(): LibraryArgumentCheckDescriptor {
  return callbackArgument([callbackParameter('request', requestTypeId), callbackParameter('response', responseTypeId)])
}

function callbackParameter(name: string, resultTypeId: string): LibraryCallbackParameterDescriptor {
  return {
    name,
    valueType: 'object',
    resultTypeId
  }
}

function callbackArgument(parameters: LibraryCallbackParameterDescriptor[]): LibraryArgumentCheckDescriptor {
  return {
    valueTypes: ['function'],
    functionParameters: parameters,
    functionReturnType: 'void'
  }
}

function optionalStringOrCallbackArgument(): LibraryArgumentCheckDescriptor {
  return {
    ...zeroArgumentCallback(),
    valueTypes: ['string', 'function']
  }
}

function listenOptionsArgument(): LibraryArgumentCheckDescriptor {
  return {
    valueTypes: ['object'],
    objectLiteralFields: [
      { name: 'port', valueTypes: ['number'], optional: true },
      { name: 'host', valueTypes: ['string'], optional: true },
      { name: 'backlog', valueTypes: ['number'], optional: true }
    ]
  }
}

function headersArgument(): LibraryArgumentCheckDescriptor {
  return {
    valueTypes: ['object'],
    objectFieldValueType: 'string'
  }
}

function requestEventArgument(): LibraryArgumentCheckDescriptor {
  return {
    valueTypes: ['string'],
    stringLiterals: ['request'],
    literalDiagnosticCode: 'INOX_HTTP_SERVER',
    literalDiagnosticMessage: "node:http Server.on supports only the 'request' event"
  }
}
