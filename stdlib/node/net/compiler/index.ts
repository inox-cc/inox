import type {
  CompilerLibraryPackageDescriptor,
  LibraryArgumentCheckDescriptor,
  LibraryCArgumentKind,
  LibraryCallbackParameterDescriptor,
  LibraryOperationDescriptor,
  LibraryOperationVariantDescriptor
} from '../../../../compiler/extensions/types.ts'

const libraryId = 'node:net'
const runtimeRequirement = libraryId
const serverTypeId = `${libraryId}#Server`
const socketTypeId = `${libraryId}#Socket`
const addressTypeId = `${libraryId}#AddressInfo`
const runtimeRequirements = [runtimeRequirement]

const operations: LibraryOperationDescriptor[] = [
  createServerOperation(),
  connectOperation(),
  serverAddressOperation(),
  serverCloseOperation(),
  serverListenOperation(),
  serverOnOperation(),
  socketAddressOperation(),
  socketScalarMemberReadOperation('bytesRead', 'double', 'number'),
  socketScalarMemberReadOperation('bytesWritten', 'double', 'number'),
  socketResultOperation('destroy'),
  socketEndOperation(),
  socketScalarMemberReadOperation('localAddress', 'inox::String', 'string'),
  socketScalarMemberReadOperation('localPort', 'double', 'number'),
  socketOnOperation(),
  socketResultOperation('ref'),
  socketScalarMemberReadOperation('remoteAddress', 'inox::String', 'string'),
  socketScalarMemberReadOperation('remotePort', 'double', 'number'),
  socketSetEncodingOperation(),
  socketSetKeepAliveOperation(),
  socketSetNoDelayOperation(),
  socketResultOperation('unref'),
  socketWriteOperation()
]

export const compilerLibraryPackage: CompilerLibraryPackageDescriptor = {
  id: libraryId,
  dependencies: [],
  nativeTypes: [
    {
      libraryId,
      typeId: serverTypeId,
      declarationNames: ['Server'],
      valueType: 'object',
      cppType: 'NetServer',
      baseTypeIds: [],
      runtimeRequirements
    },
    {
      libraryId,
      typeId: socketTypeId,
      declarationNames: ['Socket'],
      valueType: 'object',
      cppType: 'NetSocket',
      baseTypeIds: [],
      runtimeRequirements
    },
    {
      libraryId,
      typeId: addressTypeId,
      declarationNames: ['AddressInfo'],
      valueType: 'object',
      cppType: 'NetAddress',
      baseTypeIds: [],
      runtimeRequirements,
      fields: [
        { name: 'address', valueType: 'string', readonly: true, cMember: 'address' },
        { name: 'family', valueType: 'string', readonly: true, cMember: 'family' },
        { name: 'port', valueType: 'number', readonly: true, cMember: 'port' }
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
        'callback-values',
        'managed-values',
        'objects',
        'string-bytes'
      ],
      cPreludeIncludes: ['inox/net.h'],
      capabilities: ['tcp'],
      backendConstraints: [
        {
          option: 'loopBackend',
          allowedValues: ['libuv'],
          diagnosticCode: 'INOX_NOT_IMPLEMENTED',
          diagnosticMessage:
            "node:net is not implemented for C without libuv; compile with loopBackend: 'libuv' or --loop-backend libuv"
        }
      ]
    }
  ]
}

function createServerOperation(): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: moduleBinding('createServer'),
    bindingAliases: [moduleBinding('default.createServer')],
    operationId: `${libraryId}#createServer`,
    kind: 'call',
    runtimeRequirements,
    cExpression: 'net.createServer',
    cFailureMode: 'thrown',
    minArgs: 0,
    maxArgs: 1,
    argumentChecks: [connectionCallbackArgument()],
    variants: [
      callVariant(0, 0, []),
      callVariant(1, 1, ['runtime-callback'], {
        argumentChecks: [connectionCallbackArgument()],
        callbackLifetime: 'event-loop'
      })
    ],
    resultTypeId: serverTypeId,
    cppType: 'NetServer',
    valueType: 'object',
    nullable: false,
    owned: false
  }
}

function connectOperation(): LibraryOperationDescriptor {
  const callback = zeroArgumentCallback()
  const options = connectionOptionsArgument()

  return {
    libraryId,
    bindingId: moduleBinding('connect'),
    bindingAliases: [
      moduleBinding('createConnection'),
      moduleBinding('default.connect'),
      moduleBinding('default.createConnection')
    ],
    operationId: `${libraryId}#connect`,
    kind: 'call',
    runtimeRequirements,
    cExpression: 'net.connect',
    cFailureMode: 'thrown',
    minArgs: 1,
    maxArgs: 3,
    argumentChecks: [
      { valueTypes: ['number', 'object'], objectLiteralFields: options.objectLiteralFields },
      optionalStringOrCallbackArgument(),
      callback
    ],
    variants: [
      callVariant(1, 1, ['number'], {
        argumentIndex: 0,
        argumentValueTypes: ['number'],
        argumentChecks: [numberArgument()]
      }),
      callVariant(1, 1, ['value'], {
        argumentIndex: 0,
        argumentValueTypes: ['object'],
        argumentChecks: [options],
        cArgumentAdapters: ['NetConnectionOptions($value)']
      }),
      callVariant(2, 2, ['number', 'string-view'], {
        argumentIndex: 1,
        argumentValueTypes: ['string'],
        argumentChecks: [numberArgument(), stringArgument()]
      }),
      callVariant(2, 2, ['value', 'runtime-callback'], {
        argumentIndex: 0,
        argumentValueTypes: ['object'],
        argumentChecks: [options, callback],
        cArgumentAdapters: ['NetConnectionOptions($value)', ''],
        cArgumentSources: [null, { argumentIndex: 1 }],
        callbackLifetime: 'event-loop'
      }),
      callVariant(2, 2, ['number', 'runtime-callback'], {
        argumentIndex: 1,
        argumentValueTypes: ['function'],
        argumentChecks: [numberArgument(), callback],
        cArgumentSources: [null, { argumentIndex: 1 }],
        callbackLifetime: 'event-loop'
      }),
      callVariant(3, 3, ['number', 'string-view', 'runtime-callback'], {
        argumentChecks: [numberArgument(), stringArgument(), callback],
        cArgumentSources: [null, null, { argumentIndex: 2 }],
        callbackLifetime: 'event-loop'
      })
    ],
    resultTypeId: socketTypeId,
    cppType: 'NetSocket',
    valueType: 'object',
    nullable: false,
    owned: false
  }
}

function serverAddressOperation(): LibraryOperationDescriptor {
  return {
    ...serverReceiverOperation('address'),
    cArgumentKinds: ['receiver'],
    minArgs: 0,
    maxArgs: 0,
    argumentChecks: [],
    resultTypeId: addressTypeId,
    cppType: 'NetAddress',
    valueType: 'object',
    nullable: false,
    owned: false
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
    resultTypeId: serverTypeId,
    cppType: 'NetServer',
    valueType: 'object',
    nullable: false,
    owned: false
  }
}

function serverListenOperation(): LibraryOperationDescriptor {
  const callback = zeroArgumentCallback()
  const options = listenOptionsArgument()

  return {
    ...serverReceiverOperation('listen'),
    minArgs: 0,
    maxArgs: 4,
    argumentChecks: [
      { valueTypes: ['number', 'object', 'function'] },
      optionalListenHostBacklogOrCallbackArgument(),
      optionalNumberOrCallbackArgument(),
      callback
    ],
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
        cArgumentAdapters: ['NetListenOptions($value)']
      }),
      serverVariant(1, 1, ['receiver', 'runtime-callback'], {
        argumentIndex: 0,
        argumentValueTypes: ['function'],
        argumentChecks: [callback],
        cArgumentSources: [null, { argumentIndex: 0 }],
        callbackLifetime: 'event-loop'
      }),
      serverVariant(2, 2, ['receiver', 'value', 'runtime-callback'], {
        argumentIndex: 0,
        argumentValueTypes: ['object'],
        argumentChecks: [options, callback],
        cArgumentAdapters: ['NetListenOptions($value)', ''],
        cArgumentSources: [null, null, { argumentIndex: 1 }],
        callbackLifetime: 'event-loop'
      }),
      serverVariant(2, 2, ['receiver', 'number', 'string-view'], {
        argumentIndex: 1,
        argumentValueTypes: ['string'],
        argumentChecks: [numberArgument(), stringArgument()]
      }),
      serverVariant(2, 2, ['receiver', 'number', 'number'], {
        argumentIndex: 1,
        argumentValueTypes: ['number'],
        argumentChecks: [numberArgument(), numberArgument()]
      }),
      serverVariant(2, 2, ['receiver', 'number', 'runtime-callback'], {
        argumentIndex: 1,
        argumentValueTypes: ['function'],
        argumentChecks: [numberArgument(), callback],
        cArgumentSources: [null, null, { argumentIndex: 1 }],
        callbackLifetime: 'event-loop'
      }),
      serverVariant(3, 3, ['receiver', 'number', 'number', 'runtime-callback'], {
        argumentIndex: 1,
        argumentValueTypes: ['number'],
        argumentChecks: [numberArgument(), numberArgument(), callback],
        cArgumentSources: [null, null, null, { argumentIndex: 2 }],
        callbackLifetime: 'event-loop'
      }),
      serverVariant(3, 3, ['receiver', 'number', 'string-view', 'number'], {
        argumentIndex: 2,
        argumentValueTypes: ['number'],
        argumentChecks: [numberArgument(), stringArgument(), numberArgument()]
      }),
      serverVariant(3, 3, ['receiver', 'number', 'string-view', 'runtime-callback'], {
        argumentIndex: 2,
        argumentValueTypes: ['function'],
        argumentChecks: [numberArgument(), stringArgument(), callback],
        cArgumentSources: [null, null, null, { argumentIndex: 2 }],
        callbackLifetime: 'event-loop'
      }),
      serverVariant(4, 4, ['receiver', 'number', 'string-view', 'number', 'runtime-callback'], {
        argumentChecks: [numberArgument(), stringArgument(), numberArgument(), callback],
        cArgumentSources: [null, null, null, null, { argumentIndex: 3 }],
        callbackLifetime: 'event-loop'
      })
    ],
    resultTypeId: serverTypeId,
    cppType: 'NetServer',
    valueType: 'object',
    nullable: false,
    owned: false
  }
}

function serverOnOperation(): LibraryOperationDescriptor {
  return {
    ...serverReceiverOperation('on'),
    minArgs: 2,
    maxArgs: 2,
    argumentChecks: [serverEventArgument(), zeroArgumentCallback()],
    variants: [
      serverEventVariant(['connection'], connectionCallbackArgument()),
      serverEventVariant(['listening', 'close'], zeroArgumentCallback()),
      serverEventVariant(['error'], errorCallbackArgument())
    ],
    resultTypeId: serverTypeId,
    cppType: 'NetServer',
    valueType: 'object',
    nullable: false,
    owned: false,
    callbackLifetime: 'event-loop'
  }
}

function socketAddressOperation(): LibraryOperationDescriptor {
  return {
    ...socketReceiverOperation('address'),
    cArgumentKinds: ['receiver'],
    minArgs: 0,
    maxArgs: 0,
    argumentChecks: [],
    resultTypeId: addressTypeId,
    cppType: 'NetAddress',
    valueType: 'object',
    nullable: false,
    owned: false
  }
}

function socketEndOperation(): LibraryOperationDescriptor {
  const callback = zeroArgumentCallback()

  return {
    ...socketReceiverOperation('end'),
    minArgs: 0,
    maxArgs: 2,
    argumentChecks: [optionalStringOrCallbackArgument(), callback],
    variants: [
      socketVariant(0, 0, ['receiver']),
      socketVariant(1, 1, ['receiver', 'string-view'], {
        argumentIndex: 0,
        argumentValueTypes: ['string'],
        argumentChecks: [stringArgument()]
      }),
      socketVariant(1, 1, ['receiver', 'runtime-callback'], {
        argumentIndex: 0,
        argumentValueTypes: ['function'],
        argumentChecks: [callback],
        cArgumentSources: [null, { argumentIndex: 0 }],
        callbackLifetime: 'event-loop'
      }),
      socketVariant(2, 2, ['receiver', 'string-view', 'runtime-callback'], {
        argumentChecks: [stringArgument(), callback],
        cArgumentSources: [null, null, { argumentIndex: 1 }],
        callbackLifetime: 'event-loop'
      })
    ],
    resultTypeId: socketTypeId,
    cppType: 'NetSocket',
    valueType: 'object',
    nullable: false,
    owned: false
  }
}

function socketOnOperation(): LibraryOperationDescriptor {
  return {
    ...socketReceiverOperation('on'),
    minArgs: 2,
    maxArgs: 2,
    argumentChecks: [socketEventArgument(), zeroArgumentCallback()],
    variants: [
      socketEventVariant(['data'], dataCallbackArgument()),
      socketEventVariant(['connect', 'ready', 'end', 'drain'], zeroArgumentCallback()),
      socketEventVariant(['close'], closeCallbackArgument()),
      socketEventVariant(['error'], errorCallbackArgument())
    ],
    resultTypeId: socketTypeId,
    cppType: 'NetSocket',
    valueType: 'object',
    nullable: false,
    owned: false,
    callbackLifetime: 'event-loop'
  }
}

function socketSetEncodingOperation(): LibraryOperationDescriptor {
  return {
    ...socketReceiverOperation('setEncoding'),
    cArgumentKinds: ['receiver', 'string-view'],
    cResultMode: 'borrowed',
    minArgs: 1,
    maxArgs: 1,
    argumentChecks: [encodingArgument()],
    resultTypeId: socketTypeId,
    cppType: 'NetSocket',
    valueType: 'object',
    nullable: false,
    owned: false
  }
}

function socketSetKeepAliveOperation(): LibraryOperationDescriptor {
  return {
    ...socketReceiverOperation('setKeepAlive'),
    minArgs: 0,
    maxArgs: 2,
    argumentChecks: [booleanArgument(), numberArgument()],
    variants: [
      socketVariant(0, 0, ['receiver']),
      socketVariant(1, 1, ['receiver', 'number'], {
        argumentChecks: [booleanArgument()]
      }),
      socketVariant(2, 2, ['receiver', 'number', 'number'], {
        argumentChecks: [booleanArgument(), numberArgument()]
      })
    ],
    resultTypeId: socketTypeId,
    cppType: 'NetSocket',
    valueType: 'object',
    nullable: false,
    owned: false
  }
}

function socketSetNoDelayOperation(): LibraryOperationDescriptor {
  return {
    ...socketReceiverOperation('setNoDelay'),
    minArgs: 0,
    maxArgs: 1,
    argumentChecks: [booleanArgument()],
    variants: [
      socketVariant(0, 0, ['receiver']),
      socketVariant(1, 1, ['receiver', 'number'], {
        argumentChecks: [booleanArgument()]
      })
    ],
    resultTypeId: socketTypeId,
    cppType: 'NetSocket',
    valueType: 'object',
    nullable: false,
    owned: false
  }
}

function socketWriteOperation(): LibraryOperationDescriptor {
  const callback = zeroArgumentCallback()

  return {
    ...socketReceiverOperation('write'),
    minArgs: 1,
    maxArgs: 2,
    argumentChecks: [stringArgument(), callback],
    variants: [
      operationVariant(1, 1, ['receiver', 'string-view'], {
        argumentChecks: [stringArgument()]
      }),
      operationVariant(2, 2, ['receiver', 'string-view', 'runtime-callback'], {
        argumentChecks: [stringArgument(), callback],
        cArgumentSources: [null, null, { argumentIndex: 1 }],
        callbackLifetime: 'event-loop'
      })
    ],
    cppType: 'bool',
    valueType: 'boolean',
    nullable: false,
    owned: false
  }
}

function socketResultOperation(name: string): LibraryOperationDescriptor {
  return {
    ...socketReceiverOperation(name),
    cArgumentKinds: ['receiver'],
    cResultMode: 'borrowed',
    minArgs: 0,
    maxArgs: 0,
    argumentChecks: [],
    resultTypeId: socketTypeId,
    cppType: 'NetSocket',
    valueType: 'object',
    nullable: false,
    owned: false
  }
}

function socketScalarMemberReadOperation(
  name: string,
  cppType: string,
  valueType: string
): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: `${socketTypeId}.${name}`,
    operationId: `${libraryId}#Socket.${name}`,
    kind: 'member-read',
    runtimeRequirements,
    receiverTypeId: socketTypeId,
    cExpression: name,
    cArgumentKinds: ['receiver'],
    cReceiverAdapter: 'NetSocket($value)',
    cCallStyle: 'member',
    cFailureMode: 'thrown',
    cppType,
    valueType,
    nullable: false,
    owned: false
  }
}

function serverReceiverOperation(name: string): LibraryOperationDescriptor {
  return receiverOperation(serverTypeId, 'Server', 'NetServer($value)', name)
}

function socketReceiverOperation(name: string): LibraryOperationDescriptor {
  return receiverOperation(socketTypeId, 'Socket', 'NetSocket($value)', name)
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
  cArgumentSources?: Array<{ argumentIndex: number } | null>
  callbackLifetime?: 'call' | 'event-loop'
}

function callVariant(
  minArgs: number,
  maxArgs: number,
  cArgumentKinds: LibraryCArgumentKind[],
  options: VariantOptions = {}
): LibraryOperationVariantDescriptor {
  return operationVariant(minArgs, maxArgs, cArgumentKinds, options)
}

function serverVariant(
  minArgs: number,
  maxArgs: number,
  cArgumentKinds: LibraryCArgumentKind[],
  options: VariantOptions = {}
): LibraryOperationVariantDescriptor {
  return {
    ...operationVariant(minArgs, maxArgs, cArgumentKinds, options),
    cResultMode: 'borrowed',
    resultTypeId: serverTypeId,
    cppType: 'NetServer',
    valueType: 'object',
    nullable: false,
    owned: false
  }
}

function socketVariant(
  minArgs: number,
  maxArgs: number,
  cArgumentKinds: LibraryCArgumentKind[],
  options: VariantOptions = {}
): LibraryOperationVariantDescriptor {
  return {
    ...operationVariant(minArgs, maxArgs, cArgumentKinds, options),
    cResultMode: 'borrowed',
    resultTypeId: socketTypeId,
    cppType: 'NetSocket',
    valueType: 'object',
    nullable: false,
    owned: false
  }
}

function operationVariant(
  minArgs: number,
  maxArgs: number,
  cArgumentKinds: LibraryCArgumentKind[],
  options: VariantOptions
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
    cArgumentSources: options.cArgumentSources,
    callbackLifetime: options.callbackLifetime
  }
}

function serverEventVariant(
  eventNames: string[],
  callback: LibraryArgumentCheckDescriptor
): LibraryOperationVariantDescriptor {
  return serverVariant(2, 2, ['receiver', 'string-view', 'runtime-callback'], {
    argumentIndex: 0,
    stringLiterals: eventNames,
    argumentChecks: [stringLiteralArgument(eventNames, 'INOX_NET_SERVER'), callback],
    cArgumentSources: [null, null, { argumentIndex: 1 }],
    callbackLifetime: 'event-loop'
  })
}

function socketEventVariant(
  eventNames: string[],
  callback: LibraryArgumentCheckDescriptor
): LibraryOperationVariantDescriptor {
  return socketVariant(2, 2, ['receiver', 'string-view', 'runtime-callback'], {
    argumentIndex: 0,
    stringLiterals: eventNames,
    argumentChecks: [stringLiteralArgument(eventNames, 'INOX_NET_SOCKET'), callback],
    cArgumentSources: [null, null, { argumentIndex: 1 }],
    callbackLifetime: 'event-loop'
  })
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

function booleanArgument(): LibraryArgumentCheckDescriptor {
  return { valueTypes: ['boolean'] }
}

function zeroArgumentCallback(): LibraryArgumentCheckDescriptor {
  return callbackArgument([])
}

function connectionCallbackArgument(): LibraryArgumentCheckDescriptor {
  return callbackArgument([
    {
      name: 'socket',
      valueType: 'object',
      resultTypeId: socketTypeId
    }
  ])
}

function dataCallbackArgument(): LibraryArgumentCheckDescriptor {
  return callbackArgument([{ name: 'chunk', valueType: 'string' }])
}

function closeCallbackArgument(): LibraryArgumentCheckDescriptor {
  return callbackArgument([{ name: 'hadError', valueType: 'boolean' }])
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

function optionalListenHostBacklogOrCallbackArgument(): LibraryArgumentCheckDescriptor {
  return {
    ...zeroArgumentCallback(),
    valueTypes: ['string', 'number', 'function']
  }
}

function optionalNumberOrCallbackArgument(): LibraryArgumentCheckDescriptor {
  return {
    ...zeroArgumentCallback(),
    valueTypes: ['number', 'function']
  }
}

function connectionOptionsArgument(): LibraryArgumentCheckDescriptor {
  return {
    valueTypes: ['object'],
    objectLiteralFields: [
      { name: 'port', valueTypes: ['number'] },
      { name: 'host', valueTypes: ['string'], optional: true }
    ]
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

function encodingArgument(): LibraryArgumentCheckDescriptor {
  return stringLiteralArgument(['utf8', 'utf-8'], 'INOX_NET_SOCKET')
}

function serverEventArgument(): LibraryArgumentCheckDescriptor {
  return stringLiteralArgument(['connection', 'listening', 'close', 'error'], 'INOX_NET_SERVER')
}

function socketEventArgument(): LibraryArgumentCheckDescriptor {
  return stringLiteralArgument(
    ['connect', 'ready', 'data', 'end', 'close', 'error', 'drain'],
    'INOX_NET_SOCKET'
  )
}

function stringLiteralArgument(values: string[], code: string): LibraryArgumentCheckDescriptor {
  return {
    valueTypes: ['string'],
    stringLiterals: values,
    literalDiagnosticCode: code,
    literalDiagnosticMessage: `node:net does not support this event or encoding literal`
  }
}
