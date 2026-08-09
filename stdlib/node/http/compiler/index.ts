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
const clientRequestTypeId = `${libraryId}#ClientRequest`
const netSocketTypeId = 'node:net#Socket'
const netAddressTypeId = 'node:net#AddressInfo'
const uint8ArrayTypeId = 'global:binary#Uint8Array'
const abortSignalTypeId = 'global:fetch#AbortSignal'
const stringRuntimeRequirement = 'global:strings#strings'
const runtimeRequirements = [runtimeRequirement]
const stringTypeRef = primitiveTypeRef('string')
const nullableStringTypeRef: PrimitiveTypeRef = { ...stringTypeRef, nullable: true }
const numberTypeRef = primitiveTypeRef('number')
const nullableNumberTypeRef: PrimitiveTypeRef = { ...numberTypeRef, nullable: true }
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
  clientCreateOperation('get'),
  clientCreateOperation('request'),
  serverAddressOperation(),
  serverCloseOperation(),
  serverListenOperation(),
  serverOnOperation(),
  serverSetTimeoutOperation(),
  requestMemberReadOperation('headers', headersTypeRef, valueCResultMapping),
  requestMemberReadOperation('httpVersion', stringTypeRef, stringCResultMapping),
  requestMemberReadOperation('method', stringTypeRef, stringCResultMapping),
  requestMemberReadOperation('socket', nominalTypeRef(netSocketTypeId, 'value')),
  requestOptionalMemberReadOperation('statusCode', nullableNumberTypeRef),
  requestOptionalMemberReadOperation('statusMessage', nullableStringTypeRef),
  requestMemberReadOperation('url', stringTypeRef, stringCResultMapping),
  requestIsPausedOperation(),
  requestOnOperation(),
  requestFlowOperation('pause'),
  requestFlowOperation('resume'),
  requestSetEncodingOperation(),
  clientBooleanReadOperation('destroyed'),
  clientBooleanReadOperation('headersSent'),
  clientBooleanReadOperation('writableEnded'),
  clientDestroyOperation(),
  clientEndOperation(),
  clientGetHeaderOperation(),
  clientGetHeaderNamesOperation(),
  clientHasHeaderOperation(),
  clientOnOperation(),
  clientRemoveHeaderOperation(),
  clientSetHeaderOperation(),
  clientSetTimeoutOperation(),
  clientWriteOperation(),
  responseBooleanReadOperation('headersSent'),
  responseStatusReadOperation(),
  responseStatusWriteOperation(),
  responseBooleanReadOperation('writableEnded'),
  responseEndOperation(),
  responseGetHeaderOperation(),
  responseGetHeaderNamesOperation(),
  responseHasHeaderOperation(),
  responseOnOperation(),
  responseRemoveHeaderOperation(),
  responseSetHeaderOperation(),
  responseWriteOperation(),
  responseWriteHeadOperation()
]

export const compilerLibraryPackage: CompilerLibraryPackageDescriptor = {
  id: libraryId,
  dependencies: ['global:binary', collectionsLibraryId, 'global:error', 'global:fetch', 'global:strings', 'node:net'],
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
      cValueAdapterPreservesPendingException: true,
      fields: [
        {
          name: 'headers',
          valueType: 'object',
          typeRef: headersTypeRef,
          readonly: true,
          cGetter: 'headers',
          cppType: 'inox::Value'
        },
        { name: 'httpVersion', valueType: 'string', readonly: true, cGetter: 'httpVersion', cppType: 'inox::String' },
        { name: 'method', valueType: 'string', readonly: true, cGetter: 'method', cppType: 'inox::String' },
        {
          name: 'socket',
          valueType: 'object',
          typeRef: nominalTypeRef(netSocketTypeId, 'value'),
          readonly: true,
          cGetter: 'socket',
          cppType: 'NetSocket'
        },
        {
          name: 'statusCode',
          valueType: 'number',
          nullable: true,
          readonly: true,
          cGetter: 'statusCode',
          cppType: 'inox::Value'
        },
        {
          name: 'statusMessage',
          valueType: 'string',
          nullable: true,
          readonly: true,
          cGetter: 'statusMessage',
          cppType: 'inox::Value'
        },
        { name: 'url', valueType: 'string', readonly: true, cGetter: 'url', cppType: 'inox::String' }
      ]
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
      cValueAdapterPreservesPendingException: true,
      fields: [
        { name: 'headersSent', valueType: 'boolean', readonly: true, cGetter: 'headersSent' },
        { name: 'statusCode', valueType: 'number', readonly: false, cGetter: 'statusCode' },
        { name: 'writableEnded', valueType: 'boolean', readonly: true, cGetter: 'writableEnded' }
      ]
    },
    {
      libraryId,
      typeId: clientRequestTypeId,
      declarationNames: ['ClientRequest'],
      valueType: 'object',
      cppType: 'HttpClientRequest',
      baseTypeIds: [],
      runtimeRequirements,
      cValueAdapter: 'HttpClientRequest(inox::Value($value))',
      cValueAdapterPreservesPendingException: true,
      fields: [
        { name: 'destroyed', valueType: 'boolean', readonly: true, cGetter: 'destroyed' },
        { name: 'headersSent', valueType: 'boolean', readonly: true, cGetter: 'headersSent' },
        { name: 'writableEnded', valueType: 'boolean', readonly: true, cGetter: 'writableEnded' }
      ]
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
        stringRuntimeRequirement,
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
    cExpression: `http.${name}`,
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
        cArgumentAdapters: ['HttpRequestOptions($value)']
      }),
      operationVariant(2, 2, ['value', 'runtime-callback'], {
        argumentIndex: 0,
        argumentValueTypes: ['object'],
        argumentChecks: [options, callback],
        cArgumentAdapters: ['HttpRequestOptions($value)', ''],
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
        cArgumentAdapters: ['', 'HttpRequestOptions($value)']
      }),
      operationVariant(3, 3, ['string-view', 'value', 'runtime-callback'], {
        argumentChecks: [stringArgument(), options, callback],
        cArgumentAdapters: ['', 'HttpRequestOptions($value)', ''],
        cArgumentSources: [null, null, { argumentIndex: 2 }],
        callbackLifetime: 'event-loop'
      })
    ],
    resultTypeRef: nominalTypeRef(clientRequestTypeId, 'value'),
    callbackLifetime: 'event-loop'
  }
}

function serverAddressOperation(): LibraryOperationDescriptor {
  return {
    ...serverReceiverOperation('address'),
    cArgumentKinds: ['receiver'],
    minArgs: 0,
    maxArgs: 0,
    argumentChecks: [],
    resultTypeRef: nominalTypeRef(netAddressTypeId, 'value')
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
  const timeoutCallback = serverTimeoutCallbackArgument()

  return {
    ...serverReceiverOperation('on'),
    minArgs: 2,
    maxArgs: 2,
    argumentChecks: [serverEventArgument(), { valueTypes: ['function'] }],
    variants: [
      serverVariant(2, 2, ['receiver', 'string-view', 'runtime-callback'], {
        argumentIndex: 0,
        stringLiterals: ['request'],
        argumentChecks: [serverEventArgument(), callback],
        cArgumentSources: [null, null, { argumentIndex: 1 }],
        callbackLifetime: 'event-loop'
      }),
      serverVariant(2, 2, ['receiver', 'string-view', 'runtime-callback'], {
        argumentIndex: 0,
        stringLiterals: ['timeout'],
        argumentChecks: [serverEventArgument(), timeoutCallback],
        cArgumentSources: [null, null, { argumentIndex: 1 }],
        callbackLifetime: 'event-loop'
      })
    ],
    cResultMode: 'borrowed',
    resultTypeRef: nominalTypeRef(serverTypeId, 'borrowed'),
    callbackLifetime: 'event-loop'
  }
}

function serverSetTimeoutOperation(): LibraryOperationDescriptor {
  const callback = serverTimeoutCallbackArgument()

  return {
    ...serverReceiverOperation('setTimeout'),
    minArgs: 0,
    maxArgs: 2,
    argumentChecks: [numberArgument(), callback],
    variants: [
      serverVariant(0, 0, ['receiver']),
      serverVariant(1, 1, ['receiver', 'number'], { argumentChecks: [numberArgument()] }),
      serverVariant(2, 2, ['receiver', 'number', 'runtime-callback'], {
        argumentChecks: [numberArgument(), callback],
        cArgumentSources: [null, null, { argumentIndex: 1 }],
        callbackLifetime: 'event-loop'
      })
    ],
    resultTypeRef: nominalTypeRef(serverTypeId, 'borrowed')
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

function requestOptionalMemberReadOperation(
  name: 'statusCode' | 'statusMessage',
  resultTypeRef: TypeRef
): LibraryOperationDescriptor {
  return requestMemberReadOperation(name, resultTypeRef, valueCResultMapping)
}

function requestOnOperation(): LibraryOperationDescriptor {
  return {
    ...requestReceiverOperation('on'),
    minArgs: 2,
    maxArgs: 2,
    argumentChecks: [requestStreamEventArgument(), zeroArgumentCallback()],
    variants: [
      requestEventVariant(['data'], dataCallbackArgument()),
      requestEventVariant(['end', 'close'], zeroArgumentCallback()),
      requestEventVariant(['error'], errorCallbackArgument())
    ],
    cResultMode: 'borrowed',
    resultTypeRef: nominalTypeRef(requestTypeId, 'borrowed'),
    callbackLifetime: 'event-loop'
  }
}

function requestIsPausedOperation(): LibraryOperationDescriptor {
  return {
    ...requestReceiverOperation('isPaused'),
    cArgumentKinds: ['receiver'],
    minArgs: 0,
    maxArgs: 0,
    argumentChecks: [],
    resultTypeRef: booleanTypeRef
  }
}

function requestFlowOperation(name: 'pause' | 'resume'): LibraryOperationDescriptor {
  return {
    ...requestReceiverOperation(name),
    cArgumentKinds: ['receiver'],
    cResultMode: 'borrowed',
    minArgs: 0,
    maxArgs: 0,
    argumentChecks: [],
    resultTypeRef: nominalTypeRef(requestTypeId, 'borrowed')
  }
}

function requestSetEncodingOperation(): LibraryOperationDescriptor {
  return {
    ...requestReceiverOperation('setEncoding'),
    cArgumentKinds: ['receiver', 'string-view'],
    cResultMode: 'borrowed',
    minArgs: 1,
    maxArgs: 1,
    argumentChecks: [encodingArgument()],
    resultTypeRef: nominalTypeRef(requestTypeId, 'borrowed')
  }
}

function clientBooleanReadOperation(name: 'destroyed' | 'headersSent' | 'writableEnded'): LibraryOperationDescriptor {
  return {
    ...clientReceiverOperation(name),
    kind: 'member-read',
    cArgumentKinds: ['receiver'],
    resultTypeRef: booleanTypeRef
  }
}

function clientDestroyOperation(): LibraryOperationDescriptor {
  return {
    ...clientReceiverOperation('destroy'),
    cResultMode: 'borrowed',
    minArgs: 0,
    maxArgs: 1,
    argumentChecks: [{ valueTypes: ['object'] }],
    variants: [
      clientVariant(0, 0, ['receiver']),
      clientVariant(1, 1, ['receiver', 'value'], { argumentChecks: [{ valueTypes: ['object'] }] })
    ],
    resultTypeRef: nominalTypeRef(clientRequestTypeId, 'borrowed')
  }
}

function clientSetTimeoutOperation(): LibraryOperationDescriptor {
  const callback = zeroArgumentCallback()

  return {
    ...clientReceiverOperation('setTimeout'),
    minArgs: 1,
    maxArgs: 2,
    argumentChecks: [numberArgument(), callback],
    variants: [
      clientVariant(1, 1, ['receiver', 'number'], { argumentChecks: [numberArgument()] }),
      clientVariant(2, 2, ['receiver', 'number', 'runtime-callback'], {
        argumentChecks: [numberArgument(), callback],
        cArgumentSources: [null, null, { argumentIndex: 1 }],
        callbackLifetime: 'event-loop'
      })
    ],
    cResultMode: 'borrowed',
    resultTypeRef: nominalTypeRef(clientRequestTypeId, 'borrowed')
  }
}

function clientEndOperation(): LibraryOperationDescriptor {
  return {
    ...clientReceiverOperation('end'),
    minArgs: 0,
    maxArgs: 1,
    argumentChecks: [bodyArgument()],
    variants: [clientVariant(0, 0, ['receiver']), clientBodyVariant('string', true), clientBodyVariant('bytes', true)],
    cResultMode: 'borrowed',
    resultTypeRef: nominalTypeRef(clientRequestTypeId, 'borrowed')
  }
}

function clientGetHeaderOperation(): LibraryOperationDescriptor {
  return {
    ...clientReceiverOperation('getHeader'),
    cArgumentKinds: ['receiver', 'string-view'],
    minArgs: 1,
    maxArgs: 1,
    argumentChecks: [stringArgument()],
    resultTypeRef: nullableStringTypeRef,
    cResultMapping: valueCResultMapping
  }
}

function clientGetHeaderNamesOperation(): LibraryOperationDescriptor {
  return {
    ...clientReceiverOperation('getHeaderNames'),
    cArgumentKinds: ['receiver'],
    minArgs: 0,
    maxArgs: 0,
    argumentChecks: [],
    resultTypeRef: arrayTypeRef(stringTypeRef)
  }
}

function clientHasHeaderOperation(): LibraryOperationDescriptor {
  return {
    ...clientReceiverOperation('hasHeader'),
    cArgumentKinds: ['receiver', 'string-view'],
    minArgs: 1,
    maxArgs: 1,
    argumentChecks: [stringArgument()],
    resultTypeRef: booleanTypeRef
  }
}

function clientOnOperation(): LibraryOperationDescriptor {
  return {
    ...clientReceiverOperation('on'),
    minArgs: 2,
    maxArgs: 2,
    argumentChecks: [clientEventArgument(), zeroArgumentCallback()],
    variants: [
      clientEventVariant(['response'], responseCallbackArgument()),
      clientEventVariant(['finish', 'close', 'drain', 'timeout'], zeroArgumentCallback()),
      clientEventVariant(['error'], errorCallbackArgument())
    ],
    cResultMode: 'borrowed',
    resultTypeRef: nominalTypeRef(clientRequestTypeId, 'borrowed'),
    callbackLifetime: 'event-loop'
  }
}

function clientRemoveHeaderOperation(): LibraryOperationDescriptor {
  return {
    ...clientReceiverOperation('removeHeader'),
    cArgumentKinds: ['receiver', 'string-view'],
    minArgs: 1,
    maxArgs: 1,
    argumentChecks: [stringArgument()],
    resultTypeRef: voidTypeRef
  }
}

function clientSetHeaderOperation(): LibraryOperationDescriptor {
  return {
    ...clientReceiverOperation('setHeader'),
    cArgumentKinds: ['receiver', 'string-view', 'string-view'],
    minArgs: 2,
    maxArgs: 2,
    argumentChecks: [stringArgument(), stringArgument()],
    cResultMode: 'borrowed',
    resultTypeRef: nominalTypeRef(clientRequestTypeId, 'borrowed')
  }
}

function clientWriteOperation(): LibraryOperationDescriptor {
  return {
    ...clientReceiverOperation('write'),
    minArgs: 1,
    maxArgs: 1,
    argumentChecks: [bodyArgument()],
    variants: [clientBodyVariant('string', false), clientBodyVariant('bytes', false)],
    resultTypeRef: booleanTypeRef
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

function responseOnOperation(): LibraryOperationDescriptor {
  const callback = zeroArgumentCallback()

  return {
    ...responseReceiverOperation('on'),
    minArgs: 2,
    maxArgs: 2,
    argumentChecks: [responseEventArgument(), callback],
    variants: [
      operationVariant(2, 2, ['receiver', 'string-view', 'runtime-callback'], {
        argumentIndex: 0,
        stringLiterals: ['drain'],
        argumentChecks: [responseEventArgument(), callback],
        cArgumentSources: [null, null, { argumentIndex: 1 }],
        cResultMode: 'borrowed',
        callbackLifetime: 'event-loop'
      })
    ],
    cResultMode: 'borrowed',
    resultTypeRef: nominalTypeRef(responseTypeId, 'borrowed'),
    callbackLifetime: 'event-loop'
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

function requestReceiverOperation(name: string): LibraryOperationDescriptor {
  return receiverOperation(requestTypeId, 'IncomingMessage', 'HttpRequest($value)', name)
}

function clientReceiverOperation(name: string): LibraryOperationDescriptor {
  return receiverOperation(clientRequestTypeId, 'ClientRequest', 'HttpClientRequest($value)', name)
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

function clientVariant(
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

function clientBodyVariant(valueType: 'string' | 'bytes', borrowed: boolean): LibraryOperationVariantDescriptor {
  const variant = bodyVariant(valueType)
  return borrowed ? { ...variant, cResultMode: 'borrowed' } : variant
}

function requestEventVariant(
  eventNames: string[],
  callback: LibraryArgumentCheckDescriptor
): LibraryOperationVariantDescriptor {
  return operationVariant(2, 2, ['receiver', 'string-view', 'runtime-callback'], {
    argumentIndex: 0,
    stringLiterals: eventNames,
    argumentChecks: [stringLiteralArgument(eventNames, 'INOX_HTTP_MESSAGE'), callback],
    cArgumentSources: [null, null, { argumentIndex: 1 }],
    cResultMode: 'borrowed',
    callbackLifetime: 'event-loop'
  })
}

function clientEventVariant(
  eventNames: string[],
  callback: LibraryArgumentCheckDescriptor
): LibraryOperationVariantDescriptor {
  return clientVariant(2, 2, ['receiver', 'string-view', 'runtime-callback'], {
    argumentIndex: 0,
    stringLiterals: eventNames,
    argumentChecks: [stringLiteralArgument(eventNames, 'INOX_HTTP_CLIENT_REQUEST'), callback],
    cArgumentSources: [null, null, { argumentIndex: 1 }],
    callbackLifetime: 'event-loop'
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

function responseCallbackArgument(): LibraryArgumentCheckDescriptor {
  return callbackArgument([callbackParameter('response', requestTypeId)])
}

function dataCallbackArgument(): LibraryArgumentCheckDescriptor {
  return callbackArgument([{ name: 'chunk', valueType: 'string' }])
}

function errorCallbackArgument(): LibraryArgumentCheckDescriptor {
  return callbackArgument([
    {
      name: 'error',
      valueType: 'object',
      shapeFields: [{ name: 'message', valueType: 'string', readonly: true }]
    }
  ])
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
      {
        name: 'signal',
        valueTypes: ['object'],
        objectTypeIds: [abortSignalTypeId],
        optional: true
      },
      { name: 'timeout', valueTypes: ['number'], optional: true }
    ]
  }
}

function headersArgument(): LibraryArgumentCheckDescriptor {
  return {
    valueTypes: ['object'],
    objectFieldValueType: 'string'
  }
}

function serverEventArgument(): LibraryArgumentCheckDescriptor {
  return {
    valueTypes: ['string'],
    stringLiterals: ['request', 'timeout'],
    literalDiagnosticCode: 'INOX_HTTP_SERVER',
    literalDiagnosticMessage: "node:http Server.on supports only the 'request' and 'timeout' events"
  }
}

function serverTimeoutCallbackArgument(): LibraryArgumentCheckDescriptor {
  return callbackArgument([callbackParameter('socket', netSocketTypeId)])
}

function requestStreamEventArgument(): LibraryArgumentCheckDescriptor {
  return stringLiteralArgument(['data', 'end', 'close', 'error'], 'INOX_HTTP_MESSAGE')
}

function clientEventArgument(): LibraryArgumentCheckDescriptor {
  return stringLiteralArgument(['response', 'finish', 'close', 'error', 'drain', 'timeout'], 'INOX_HTTP_CLIENT_REQUEST')
}

function responseEventArgument(): LibraryArgumentCheckDescriptor {
  return stringLiteralArgument(['drain'], 'INOX_HTTP_RESPONSE')
}

function encodingArgument(): LibraryArgumentCheckDescriptor {
  return stringLiteralArgument(['utf8', 'utf-8'], 'INOX_HTTP_MESSAGE')
}

function stringLiteralArgument(values: string[], code: string): LibraryArgumentCheckDescriptor {
  return {
    valueTypes: ['string'],
    stringLiterals: values,
    literalDiagnosticCode: code,
    literalDiagnosticMessage: `node:http supports only ${values.join(', ')} here`
  }
}
