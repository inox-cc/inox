import type {
  CompilerLibraryPackageDescriptor,
  LibraryArgumentCheckDescriptor,
  LibraryCArgumentKind,
  LibraryCResultMappingDescriptor,
  LibraryObjectLiteralFieldDescriptor,
  LibraryOperationDescriptor,
  LibraryOperationKind,
  LibraryResultShapeFieldDescriptor,
  NominalTypeRef,
  PrimitiveTypeRef,
  TypeRef
} from '../../../../compiler/extensions/types.ts'
import { errorTypeRef } from '../../error/compiler/index.ts'

const libraryId = 'global:fetch'
const promiseTypeId = 'global:promise#Promise'
const runtimeRequirement = libraryId
const abortControllerTypeId = `${libraryId}#AbortController`
const abortSignalTypeId = `${libraryId}#AbortSignal`
const headersTypeId = `${libraryId}#Headers`
const responseTypeId = `${libraryId}#Response`
const runtimeRequirements = [runtimeRequirement]
const abortSignalTypeRef = nominalTypeRef(abortSignalTypeId)
const headersTypeRef = nominalTypeRef(headersTypeId)
const responseTypeRef = nominalTypeRef(responseTypeId)
const booleanTypeRef = primitiveTypeRef('boolean')
const nullableStringTypeRef = primitiveTypeRef('string', true)
const stringTypeRef = primitiveTypeRef('string')
const voidTypeRef = primitiveTypeRef('void')
const valueCResultMapping: LibraryCResultMappingDescriptor = {
  cppType: 'inox::Value',
  fields: []
}
const responseFields: LibraryResultShapeFieldDescriptor[] = [
  field('status', 'number', 'status', 'double'),
  field('ok', 'boolean', 'ok', 'bool'),
  field('url', 'string', 'url', 'inox::String'),
  field('statusText', 'string', 'statusText', 'inox::String'),
  field('redirected', 'boolean', 'redirected', 'bool'),
  {
    name: 'headers',
    valueType: 'object',
    readonly: true,
    cMember: 'headers',
    resultTypeId: headersTypeId,
    cppType: 'inox::FetchHeaders'
  }
]

const operations: LibraryOperationDescriptor[] = [
  fetchOperation(),
  {
    libraryId,
    bindingId: 'global:AbortController',
    operationId: `${libraryId}#AbortController.construct`,
    kind: 'construct',
    runtimeRequirements,
    cExpression: 'inox::AbortController',
    cArgumentKinds: [],
    cCallStyle: 'function',
    cFailureMode: 'thrown',
    minArgs: 0,
    maxArgs: 0,
    argumentChecks: [],
    resultTypeRef: nominalTypeRef(abortControllerTypeId),
    cResultMode: 'value'
  },
  receiverCall(abortControllerTypeId, 'abort', 'inox::AbortController($value)', [], voidTypeRef),
  receiverCall(responseTypeId, 'text', 'inox::FetchResponse(inox::Value($value))', [], promiseTypeRef(stringTypeRef, errorTypeRef())),
  receiverCall(headersTypeId, 'get', 'inox::FetchHeaders(inox::Value($value))', [stringArgument()], nullableStringTypeRef, valueCResultMapping),
  receiverCall(headersTypeId, 'has', 'inox::FetchHeaders(inox::Value($value))', [stringArgument()], booleanTypeRef),
  unsupportedResponseMember('body', 'member-read'),
  unsupportedResponseCall('arrayBuffer'),
  unsupportedResponseCall('blob'),
  unsupportedResponseCall('bytes'),
  unsupportedResponseCall('formData'),
  unsupportedResponseCall('json')
]

export const compilerLibraryPackage: CompilerLibraryPackageDescriptor = {
  id: libraryId,
  dependencies: ['global:binary', 'global:error', 'global:promise'],
  nativeTypes: [
    {
      libraryId,
      typeId: abortControllerTypeId,
      declarationNames: ['AbortController'],
      valueType: 'object',
      cppType: 'inox::AbortController',
      baseTypeIds: [],
      runtimeRequirements,
      fields: [
        {
          name: 'signal',
          valueType: 'object',
          readonly: true,
          cMember: 'signal',
          resultTypeId: abortSignalTypeId,
          cppType: 'inox::AbortSignal'
        }
      ]
    },
    {
      libraryId,
      typeId: abortSignalTypeId,
      declarationNames: ['AbortSignal'],
      valueType: 'object',
      cppType: 'inox::AbortSignal',
      baseTypeIds: [],
      runtimeRequirements,
      fields: [field('aborted', 'boolean', 'aborted', 'bool')]
    },
    {
      libraryId,
      typeId: headersTypeId,
      declarationNames: ['Headers'],
      valueType: 'object',
      cppType: 'inox::FetchHeaders',
      baseTypeIds: [],
      runtimeRequirements
    },
    {
      libraryId,
      typeId: responseTypeId,
      declarationNames: ['Response'],
      valueType: 'object',
      cppType: 'inox::FetchResponse',
      baseTypeIds: [],
      runtimeRequirements,
      fields: responseFields
    }
  ],
  operations,
  intrinsicBindings: [],
  runtimeRequirements: [
    {
      id: runtimeRequirement,
      dependencies: ['async-runtime', 'managed-values', 'objects', 'string-bytes'],
      cPreludeIncludes: ['inox/fetch.h'],
      capabilities: ['tcp'],
      backendConstraints: [
        {
          option: 'loopBackend',
          allowedValues: ['libuv'],
          diagnosticCode: 'INOX_NOT_IMPLEMENTED',
          diagnosticMessage: "fetch is not implemented for C without libuv; compile with loopBackend: 'libuv' or --loop-backend libuv"
        }
      ]
    }
  ]
}

function fetchOperation(): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: 'global:fetch',
    operationId: `${libraryId}#fetch`,
    kind: 'call',
    runtimeRequirements,
    cCallStyle: 'function',
    minArgs: 1,
    maxArgs: 2,
    argumentChecks: [fetchUrlArgument(), fetchInitArgument()],
    variants: [
      fetchVariant(1, ['string-view']),
      fetchVariant(2, ['string-view', 'value'])
    ],
    resultTypeRef: promiseTypeRef(responseTypeRef, errorTypeRef())
  }
}

function fetchVariant(argumentCount: number, cArgumentKinds: LibraryCArgumentKind[]) {
  return {
    minArgs: argumentCount,
    maxArgs: argumentCount,
    cExpression: 'inox::fetch',
    cArgumentKinds
  }
}

function fetchInitArgument(): LibraryArgumentCheckDescriptor {
  return {
    valueTypes: ['object'],
    objectLiteralFields: [
      option('method', ['string']),
      {
        ...option('headers', ['object']),
        objectLiteralRequired: true,
        objectFieldValueType: 'string'
      },
      option('body', ['string', 'bytes']),
      {
        ...option('signal', ['object']),
        objectTypeIds: [abortSignalTypeId]
      },
      {
        ...option('redirect', ['string']),
        stringLiterals: ['error', 'follow', 'manual']
      }
    ]
  }
}

function option(name: string, valueTypes: string[]): LibraryObjectLiteralFieldDescriptor {
  return { name, valueTypes, optional: true }
}

function receiverCall(
  receiverTypeId: string,
  name: string,
  receiverAdapter: string,
  argumentChecks: LibraryArgumentCheckDescriptor[],
  resultTypeRef: TypeRef,
  cResultMapping?: LibraryCResultMappingDescriptor
): LibraryOperationDescriptor {
  const cArgumentKinds: LibraryCArgumentKind[] = ['receiver']

  for (let index = 0; index < argumentChecks.length; index = index + 1) {
    cArgumentKinds.push('string-view')
  }

  return {
    libraryId,
    bindingId: `${receiverTypeId}.${name}`,
    operationId: `${libraryId}#${nativeTypeName(receiverTypeId)}.${name}`,
    kind: 'call',
    runtimeRequirements,
    receiverTypeId,
    cExpression: name,
    cArgumentKinds,
    cReceiverAdapter: receiverAdapter,
    cCallStyle: 'member',
    cFailureMode: resultTypeRef.kind === 'nominal' && resultTypeRef.typeId === promiseTypeId ? null : 'thrown',
    minArgs: argumentChecks.length,
    maxArgs: argumentChecks.length,
    argumentChecks,
    resultTypeRef,
    cResultMapping
  }
}

function unsupportedResponseCall(name: string): LibraryOperationDescriptor {
  return unsupportedResponseMember(name, 'call')
}

function unsupportedResponseMember(name: string, kind: LibraryOperationKind): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: `${responseTypeId}.${name}`,
    operationId: `${libraryId}#Response.${name}`,
    kind,
    runtimeRequirements: [],
    receiverTypeId: responseTypeId,
    diagnosticCode: 'INOX_FETCH',
    diagnosticMessage: name === 'body'
      ? 'Response.body streams are not supported by the current C/libuv fetch slice'
      : `Response.${name} is not supported by the current C/libuv fetch slice`
  }
}

function stringArgument(): LibraryArgumentCheckDescriptor {
  return { valueTypes: ['string'] }
}

function fetchUrlArgument(): LibraryArgumentCheckDescriptor {
  return {
    valueTypes: ['string'],
    stringPrefixBackendConstraints: [
      {
        prefixes: ['https://'],
        option: 'tlsBackend',
        allowedValues: ['boringssl', 'openssl'],
        diagnosticCode: 'INOX_FETCH',
        diagnosticMessage: 'https fetch URLs require a configured TLS adapter and are not supported by the current C/libuv fetch slice'
      }
    ]
  }
}

function nativeTypeName(typeId: string): string {
  const separator = typeId.lastIndexOf('#')
  return separator < 0 ? typeId : typeId.slice(separator + 1)
}

function nominalTypeRef(typeId: string): NominalTypeRef {
  return {
    kind: 'nominal',
    typeId,
    args: [],
    nullable: false,
    ownership: 'value',
    traits: []
  }
}

function promiseTypeRef(fulfilledType: TypeRef, rejectedType: TypeRef): NominalTypeRef {
  return {
    kind: 'nominal',
    typeId: promiseTypeId,
    args: [fulfilledType],
    nullable: false,
    ownership: 'value',
    traits: [{ traitId: 'awaitable', args: [fulfilledType, rejectedType] }]
  }
}

function primitiveTypeRef(name: 'boolean' | 'string' | 'void', nullable = false): PrimitiveTypeRef {
  return {
    kind: 'primitive',
    name,
    nullable,
    ownership: 'value',
    traits: []
  }
}

function field(
  name: string,
  valueType: string,
  cMember: string,
  cppType: string
): LibraryResultShapeFieldDescriptor {
  return { name, valueType, readonly: true, cMember, cppType }
}
