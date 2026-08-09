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
const httpRuntimeRequirements = ['node:http']
const httpAgentTypeId = 'node:http#Agent'
const agentTypeId = `${libraryId}#Agent`
const requestTypeId = 'node:http#IncomingMessage'
const clientRequestTypeId = 'node:http#ClientRequest'
const serverTypeId = 'node:http#Server'
const responseTypeId = 'node:http#ServerResponse'
const abortSignalTypeId = 'global:fetch#AbortSignal'

const operations: LibraryOperationDescriptor[] = [
  agentConstructorOperation(),
  globalAgentReadOperation(),
  createServerOperation(),
  clientCreateOperation('get'),
  clientCreateOperation('request')
]

export const compilerLibraryPackage: CompilerLibraryPackageDescriptor = {
  id: libraryId,
  dependencies: ['node:http'],
  nativeTypes: [
    {
      libraryId,
      typeId: agentTypeId,
      declarationNames: ['Agent'],
      valueType: 'object',
      cppType: 'HttpAgent',
      baseTypeIds: [httpAgentTypeId],
      runtimeRequirements: httpRuntimeRequirements,
      cValueAdapter: 'HttpAgent(inox::Value($value))',
      cValueAdapterPreservesPendingException: true
    }
  ],
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

function agentConstructorOperation(): LibraryOperationDescriptor {
  const options: LibraryArgumentCheckDescriptor = {
    valueTypes: ['object'],
    objectLiteralFields: [
      { name: 'keepAlive', valueTypes: ['boolean'], optional: true },
      { name: 'maxSockets', valueTypes: ['number'], optional: true },
      { name: 'maxFreeSockets', valueTypes: ['number'], optional: true },
      { name: 'timeout', valueTypes: ['number'], optional: true }
    ]
  }

  return {
    libraryId,
    bindingId: moduleBinding('Agent'),
    bindingAliases: [moduleBinding('default.Agent')],
    operationId: `${libraryId}#Agent.construct`,
    kind: 'construct',
    runtimeRequirements: httpRuntimeRequirements,
    cExpression: 'HttpAgent',
    cFailureMode: 'thrown',
    minArgs: 0,
    maxArgs: 1,
    argumentChecks: [options],
    variants: [
      operationVariant(0, 0, []),
      operationVariant(1, 1, ['value'], {
        argumentChecks: [options],
        cArgumentAdapters: ['HttpAgentOptions($value)']
      })
    ],
    resultTypeRef: nominalTypeRef(agentTypeId)
  }
}

function globalAgentReadOperation(): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: moduleBinding('globalAgent'),
    bindingAliases: [moduleBinding('default.globalAgent')],
    operationId: `${libraryId}#globalAgent`,
    kind: 'member-read',
    runtimeRequirements,
    cExpression: 'https.globalAgent()',
    cFailureMode: 'thrown',
    resultTypeRef: nominalTypeRef(agentTypeId)
  }
}

function createServerOperation(): LibraryOperationDescriptor {
  const callback = requestCallbackArgument()
  const options = serverOptionsArgument()

  return {
    libraryId,
    bindingId: moduleBinding('createServer'),
    bindingAliases: [moduleBinding('default.createServer')],
    operationId: `${libraryId}#createServer`,
    kind: 'call',
    runtimeRequirements,
    cExpression: 'https.createServer',
    cFailureMode: 'thrown',
    minArgs: 1,
    maxArgs: 2,
    argumentChecks: [options, callback],
    variants: [
      operationVariant(1, 1, ['value'], {
        argumentChecks: [options],
        cArgumentAdapters: ['HttpsServerOptions($value)']
      }),
      operationVariant(2, 2, ['value', 'runtime-callback'], {
        argumentChecks: [options, callback],
        cArgumentAdapters: ['HttpsServerOptions($value)', ''],
        cArgumentSources: [null, { argumentIndex: 1 }],
        callbackLifetime: 'event-loop'
      })
    ],
    resultTypeRef: nominalTypeRef(serverTypeId),
    callbackLifetime: 'event-loop'
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

function requestCallbackArgument(): LibraryArgumentCheckDescriptor {
  return {
    valueTypes: ['function'],
    functionParameters: [
      { name: 'request', valueType: 'object', resultTypeId: requestTypeId },
      { name: 'response', valueType: 'object', resultTypeId: responseTypeId }
    ],
    functionReturnType: 'void'
  }
}

function requestOptionsArgument(): LibraryArgumentCheckDescriptor {
  return {
    valueTypes: ['object'],
    objectLiteralFields: [
      {
        name: 'agent',
        valueTypes: ['boolean', 'object'],
        booleanLiterals: [false],
        objectTypeIds: [httpAgentTypeId],
        optional: true
      },
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
      { name: 'timeout', valueTypes: ['number'], optional: true },
      { name: 'rejectUnauthorized', valueTypes: ['boolean'], optional: true },
      { name: 'servername', valueTypes: ['string'], optional: true }
    ]
  }
}

function serverOptionsArgument(): LibraryArgumentCheckDescriptor {
  return {
    valueTypes: ['object'],
    objectLiteralFields: [
      { name: 'cert', valueTypes: ['string', 'object'] },
      { name: 'key', valueTypes: ['string', 'object'] }
    ]
  }
}
