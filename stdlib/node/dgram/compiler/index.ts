import type {
  CompilerLibraryPackageDescriptor,
  LibraryArgumentCheckDescriptor,
  LibraryCArgumentKind,
  LibraryOperationDescriptor,
  LibraryOperationVariantDescriptor,
  TypeRef
} from '../../../../compiler/extensions/types.ts'

const libraryId = 'node:dgram'
const runtimeRequirement = libraryId
const socketTypeId = `${libraryId}#Socket`
const addressTypeId = `${libraryId}#AddressInfo`
const remoteInfoTypeId = `${libraryId}#RemoteInfo`
const runtimeRequirements = [runtimeRequirement]
const socketValueTypeRef = nominalTypeRef(socketTypeId, 'value')
const socketBorrowedTypeRef = nominalTypeRef(socketTypeId, 'borrowed')
const addressTypeRef = nominalTypeRef(addressTypeId, 'value')
const numberTypeRef = primitiveTypeRef('number')
const voidTypeRef = primitiveTypeRef('void')

const operations: LibraryOperationDescriptor[] = [
  createSocketOperation(),
  socketResultOperation('address', addressTypeRef),
  bindOperation(),
  closeOperation(),
  connectOperation(),
  socketResultOperation('disconnect', socketBorrowedTypeRef, true),
  socketResultOperation('getRecvBufferSize', numberTypeRef),
  socketResultOperation('getSendBufferSize', numberTypeRef),
  onOperation(),
  socketResultOperation('ref', socketBorrowedTypeRef, true),
  socketResultOperation('remoteAddress', addressTypeRef),
  sendOperation(),
  scalarSocketOperation('setBroadcast', 'number', booleanArgument()),
  scalarSocketOperation('setRecvBufferSize', 'number', numberArgument()),
  scalarSocketOperation('setSendBufferSize', 'number', numberArgument()),
  scalarSocketOperation('setTTL', 'number', numberArgument()),
  socketResultOperation('unref', socketBorrowedTypeRef, true)
]

export const compilerLibraryPackage: CompilerLibraryPackageDescriptor = {
  id: libraryId,
  dependencies: ['node:buffer'],
  nativeTypes: [
    {
      libraryId,
      typeId: socketTypeId,
      declarationNames: ['Socket'],
      valueType: 'object',
      cppType: 'DgramSocket',
      baseTypeIds: [],
      runtimeRequirements: [runtimeRequirement]
    },
    {
      libraryId,
      typeId: addressTypeId,
      declarationNames: ['AddressInfo'],
      valueType: 'object',
      cppType: 'DgramAddress',
      baseTypeIds: [],
      runtimeRequirements: [runtimeRequirement],
      fields: [
        { name: 'address', valueType: 'string', readonly: true, cMember: 'address' },
        { name: 'family', valueType: 'string', readonly: true, cMember: 'family' },
        { name: 'port', valueType: 'number', readonly: true, cMember: 'port' }
      ]
    },
    {
      libraryId,
      typeId: remoteInfoTypeId,
      declarationNames: ['RemoteInfo'],
      valueType: 'object',
      cppType: 'DgramRemoteInfo',
      baseTypeIds: [addressTypeId],
      runtimeRequirements: [runtimeRequirement],
      fields: [{ name: 'size', valueType: 'number', readonly: true, cMember: 'size' }]
    }
  ],
  operations,
  intrinsicBindings: [],
  runtimeRequirements: [
    {
      id: runtimeRequirement,
      dependencies: ['async-runtime', 'callback-values', 'managed-values', 'node:buffer', 'objects', 'string-bytes'],
      cPreludeIncludes: ['inox/dgram.h'],
      capabilities: ['udp'],
      optionConstraints: [
        {
          optionId: 'target:runtime#loop-backend',
          allowedValues: ['libuv'],
          diagnosticCode: 'INOX_NOT_IMPLEMENTED',
          diagnosticMessage: 'node:dgram is not implemented for C without libuv; select --loop-backend libuv'
        }
      ]
    }
  ]
}

function createSocketOperation(): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: moduleBinding('createSocket'),
    bindingAliases: [moduleBinding('default.createSocket')],
    operationId: `${libraryId}#createSocket`,
    kind: 'call',
    runtimeRequirements,
    cExpression: 'dgram.createSocket',
    cFailureMode: 'thrown',
    minArgs: 1,
    maxArgs: 2,
    argumentChecks: [socketOptionsArgument(), messageCallbackArgument()],
    variants: [
      callVariant(1, 1, ['string-view'], {
        argumentIndex: 0,
        argumentValueTypes: ['string']
      }),
      callVariant(2, 2, ['string-view', 'runtime-callback'], {
        argumentIndex: 0,
        argumentValueTypes: ['string'],
        cArgumentSources: [null, { argumentIndex: 1 }],
        callbackLifetime: 'event-loop'
      }),
      callVariant(1, 1, ['value'], {
        argumentIndex: 0,
        argumentValueTypes: ['object'],
        cArgumentAdapters: ['DgramSocketOptions($value)']
      }),
      callVariant(2, 2, ['value', 'runtime-callback'], {
        argumentIndex: 0,
        argumentValueTypes: ['object'],
        cArgumentAdapters: ['DgramSocketOptions($value)'],
        cArgumentSources: [null, { argumentIndex: 1 }],
        callbackLifetime: 'event-loop'
      })
    ],
    resultTypeRef: socketValueTypeRef
  }
}

function bindOperation(): LibraryOperationDescriptor {
  return receiverVariants(
    'bind',
    0,
    3,
    [{ valueTypes: ['number', 'object'] }, { valueTypes: ['string', 'function'] }, callbackArgument()],
    [
      memberVariant(0, 0, ['receiver']),
      memberVariant(1, 1, ['receiver', 'number'], {
        argumentIndex: 0,
        argumentValueTypes: ['number']
      }),
      memberVariant(1, 1, ['receiver', 'value'], {
        argumentIndex: 0,
        argumentValueTypes: ['object'],
        cArgumentAdapters: ['DgramBindOptions($value)']
      }),
      memberVariant(2, 2, ['receiver', 'number', 'string-view'], {
        argumentIndex: 0,
        argumentValueTypes: ['number']
      }),
      memberVariant(2, 2, ['receiver', 'value', 'runtime-callback'], {
        argumentIndex: 0,
        argumentValueTypes: ['object'],
        cArgumentAdapters: ['DgramBindOptions($value)', ''],
        cArgumentSources: [null, null, { argumentIndex: 1 }],
        callbackLifetime: 'event-loop'
      }),
      memberVariant(3, 3, ['receiver', 'number', 'string-view', 'runtime-callback'], {
        cArgumentSources: [null, null, null, { argumentIndex: 2 }],
        callbackLifetime: 'event-loop'
      })
    ]
  )
}

function closeOperation(): LibraryOperationDescriptor {
  return receiverVariants(
    'close',
    0,
    1,
    [callbackArgument()],
    [
      memberVariant(0, 0, ['receiver']),
      memberVariant(1, 1, ['receiver', 'runtime-callback'], {
        cArgumentSources: [null, { argumentIndex: 0 }],
        callbackLifetime: 'event-loop'
      })
    ]
  )
}

function connectOperation(): LibraryOperationDescriptor {
  return receiverVariants(
    'connect',
    1,
    3,
    [numberArgument(), stringArgument(), callbackArgument()],
    [
      memberVariant(1, 1, ['receiver', 'number']),
      memberVariant(2, 2, ['receiver', 'number', 'string-view']),
      memberVariant(3, 3, ['receiver', 'number', 'string-view', 'runtime-callback'], {
        cArgumentSources: [null, null, null, { argumentIndex: 2 }],
        callbackLifetime: 'event-loop'
      })
    ]
  )
}

function onOperation(): LibraryOperationDescriptor {
  return {
    ...receiverOperation('on'),
    cArgumentKinds: ['receiver', 'string-view', 'runtime-callback'],
    cArgumentSources: [null, null, { argumentIndex: 1 }],
    cResultMode: 'borrowed',
    minArgs: 2,
    maxArgs: 2,
    argumentChecks: [messageEventArgument(), messageCallbackArgument()],
    resultTypeRef: socketBorrowedTypeRef,
    callbackLifetime: 'event-loop'
  }
}

function sendOperation(): LibraryOperationDescriptor {
  const variants: LibraryOperationVariantDescriptor[] = []

  variants.push(sendVariant('string', 1, false, false))
  variants.push(sendVariant('bytes', 1, false, false))
  variants.push(sendVariant('string', 2, false, true))
  variants.push(sendVariant('bytes', 2, false, true))
  variants.push(sendVariant('string', 3, true, false))
  variants.push(sendVariant('bytes', 3, true, false))
  variants.push(sendVariant('string', 4, true, true))
  variants.push(sendVariant('bytes', 4, true, true))

  return {
    ...receiverOperation('send'),
    minArgs: 1,
    maxArgs: 4,
    argumentChecks: [
      { valueTypes: ['string', 'bytes'] },
      sendPortOrCallbackArgument(),
      stringArgument(),
      sendCallbackArgument()
    ],
    variants,
    resultTypeRef: voidTypeRef
  }
}

function sendVariant(
  messageType: string,
  arity: number,
  addressed: boolean,
  callback: boolean
): LibraryOperationVariantDescriptor {
  const kinds: LibraryCArgumentKind[] = ['receiver']
  const adapters: string[] = ['']
  const sources: Array<{ argumentIndex: number } | null> = []
  sources.push(null)

  if (messageType === 'string') {
    kinds.push('string-view')
    adapters.push('')
  } else {
    kinds.push('value')
    adapters.push('Uint8Array($value)')
  }
  sources.push(null)

  if (addressed) {
    kinds.push('number')
    kinds.push('string-view')
    adapters.push('')
    adapters.push('')
    sources.push(null)
    sources.push(null)
  }

  if (callback) {
    kinds.push('runtime-callback')
    adapters.push('')
    sources.push({ argumentIndex: arity - 1 })
  }

  return {
    minArgs: arity,
    maxArgs: arity,
    argumentIndex: 0,
    argumentValueTypes: [messageType],
    cExpression: 'send',
    cArgumentKinds: kinds,
    cArgumentAdapters: adapters,
    cArgumentSources: sources,
    cResultMode: null,
    callbackLifetime: callback ? 'event-loop' : null
  }
}

function scalarSocketOperation(
  name: string,
  kind: LibraryCArgumentKind,
  argumentCheck: LibraryArgumentCheckDescriptor
): LibraryOperationDescriptor {
  return {
    ...receiverOperation(name),
    cArgumentKinds: ['receiver', kind],
    cResultMode: 'borrowed',
    minArgs: 1,
    maxArgs: 1,
    argumentChecks: [argumentCheck],
    resultTypeRef: socketBorrowedTypeRef
  }
}

function socketResultOperation(
  name: string,
  resultTypeRef: TypeRef,
  borrowed: boolean = false
): LibraryOperationDescriptor {
  return {
    ...receiverOperation(name),
    cArgumentKinds: ['receiver'],
    cResultMode: borrowed ? 'borrowed' : null,
    minArgs: 0,
    maxArgs: 0,
    argumentChecks: [],
    resultTypeRef
  }
}

function receiverVariants(
  name: string,
  minArgs: number,
  maxArgs: number,
  argumentChecks: LibraryArgumentCheckDescriptor[],
  variants: LibraryOperationVariantDescriptor[]
): LibraryOperationDescriptor {
  return {
    ...receiverOperation(name),
    minArgs,
    maxArgs,
    argumentChecks,
    variants,
    resultTypeRef: socketBorrowedTypeRef
  }
}

function receiverOperation(name: string): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: `${socketTypeId}.${name}`,
    operationId: `${libraryId}#Socket.${name}`,
    kind: 'call',
    runtimeRequirements,
    receiverTypeId: socketTypeId,
    cExpression: name,
    cCallStyle: 'member',
    cFailureMode: 'thrown'
  }
}

type VariantOptions = {
  argumentIndex?: number
  argumentValueTypes?: string[]
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
  return {
    minArgs,
    maxArgs,
    argumentIndex: options.argumentIndex,
    argumentValueTypes: options.argumentValueTypes,
    cExpression: 'dgram.createSocket',
    cArgumentKinds,
    cArgumentAdapters: options.cArgumentAdapters,
    cArgumentSources: options.cArgumentSources,
    callbackLifetime: options.callbackLifetime
  }
}

function memberVariant(
  minArgs: number,
  maxArgs: number,
  cArgumentKinds: LibraryCArgumentKind[],
  options: VariantOptions = {}
): LibraryOperationVariantDescriptor {
  return {
    minArgs,
    maxArgs,
    argumentIndex: options.argumentIndex,
    argumentValueTypes: options.argumentValueTypes,
    cArgumentKinds,
    cArgumentAdapters: options.cArgumentAdapters,
    cArgumentSources: options.cArgumentSources,
    cResultMode: 'borrowed',
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

function primitiveTypeRef(name: 'number' | 'void'): TypeRef {
  return {
    kind: 'primitive',
    name,
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

function numberArgument(): LibraryArgumentCheckDescriptor {
  return { valueTypes: ['number'] }
}

function booleanArgument(): LibraryArgumentCheckDescriptor {
  return { valueTypes: ['boolean'] }
}

function callbackArgument(): LibraryArgumentCheckDescriptor {
  return {
    valueTypes: ['function'],
    functionParameters: [],
    functionReturnType: 'void'
  }
}

function sendCallbackArgument(): LibraryArgumentCheckDescriptor {
  return {
    valueTypes: ['function'],
    functionParameters: [
      {
        name: 'error',
        valueType: 'object',
        nullable: true,
        shapeFields: [{ name: 'message', valueType: 'string', readonly: true }]
      },
      { name: 'bytes', valueType: 'number' }
    ],
    functionReturnType: 'void'
  }
}

function sendPortOrCallbackArgument(): LibraryArgumentCheckDescriptor {
  const callback = sendCallbackArgument()
  return {
    ...callback,
    valueTypes: ['number', 'function']
  }
}

function messageCallbackArgument(): LibraryArgumentCheckDescriptor {
  return {
    valueTypes: ['function'],
    functionParameters: [
      {
        name: 'message',
        valueType: 'bytes',
        resultTypeId: 'node:buffer#Buffer'
      },
      {
        name: 'remoteInfo',
        valueType: 'object',
        resultTypeId: remoteInfoTypeId,
        shapeFields: [
          { name: 'address', valueType: 'string', readonly: true },
          { name: 'family', valueType: 'string', readonly: true },
          { name: 'port', valueType: 'number', readonly: true },
          { name: 'size', valueType: 'number', readonly: true }
        ]
      }
    ],
    functionReturnType: 'void'
  }
}

function messageEventArgument(): LibraryArgumentCheckDescriptor {
  return {
    valueTypes: ['string'],
    stringLiterals: ['message'],
    literalDiagnosticCode: 'INOX_DGRAM_SOCKET',
    literalDiagnosticMessage: "node:dgram Socket.on currently supports only the 'message' event"
  }
}

function socketOptionsArgument(): LibraryArgumentCheckDescriptor {
  return {
    valueTypes: ['string', 'object'],
    stringLiterals: ['udp4'],
    literalDiagnosticCode: 'INOX_DGRAM_SOCKET',
    literalDiagnosticMessage: "node:dgram createSocket currently supports only 'udp4'",
    objectLiteralFields: [
      {
        name: 'type',
        valueTypes: ['string'],
        stringLiterals: ['udp4']
      },
      {
        name: 'reuseAddr',
        valueTypes: ['boolean'],
        booleanLiterals: [false, true],
        optional: true
      },
      {
        name: 'recvBufferSize',
        valueTypes: ['number'],
        optional: true
      },
      {
        name: 'sendBufferSize',
        valueTypes: ['number'],
        optional: true
      }
    ]
  }
}
