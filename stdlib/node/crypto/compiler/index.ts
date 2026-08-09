import type {
  CompilerLibraryPackageDescriptor,
  CorePrimitiveType,
  LibraryArgumentCheckDescriptor,
  LibraryCArgumentKind,
  LibraryCResultMappingDescriptor,
  LibraryCResultMode,
  LibraryOperationDescriptor,
  LibraryOperationVariantDescriptor,
  NominalTypeRef,
  PrimitiveTypeRef,
  TypeOwnership,
  TypeRef
} from '../../../../compiler/extensions/types.ts'

const libraryId = 'node:crypto'
const collectionsLibraryId = 'global:collections'
const stringsLibraryId = 'global:strings'
const arrayRuntimeRequirement = `${collectionsLibraryId}#array`
const stringsRuntimeRequirement = `${stringsLibraryId}#strings`
const arrayTypeId = `${collectionsLibraryId}#Array`
const runtimeRequirement = 'node:crypto'
const hashRuntimeRequirement = 'node:crypto:hash'
const hashTypeId = `${libraryId}#Hash`
const hmacTypeId = `${libraryId}#Hmac`
const uint8ArrayTypeId = 'global:binary#Uint8Array'
const bufferTypeId = 'node:buffer#Buffer'

const randomRequirements = [runtimeRequirement]
const hashRequirements = [runtimeRequirement, hashRuntimeRequirement]
const stringTypeRef = primitiveTypeRef('string')

const operations: LibraryOperationDescriptor[] = [
  moduleCall('getHashes', [], [], 0, 0, [], hashRequirements, {
    resultTypeRef: arrayTypeRef(stringTypeRef),
    cResultMode: 'value'
  }),
  moduleCall('getRandomValues', ['value'], ['Uint8Array($value)'], 1, 1, [bytesArgument()], randomRequirements, {
    resultTypeRef: nominalTypeRef(uint8ArrayTypeId),
    cResultMode: 'value'
  }),
  moduleCall('randomBytes', ['number'], [], 1, 1, [numberArgument()], randomRequirements, {
    resultTypeRef: nominalTypeRef(bufferTypeId),
    cResultMode: 'value'
  }),
  moduleCall(
    'randomFillSync',
    ['value', 'optional-number', 'optional-number'],
    ['Uint8Array($value)'],
    1,
    3,
    [bytesArgument(), numberArgument(), numberArgument()],
    randomRequirements,
    { resultTypeRef: nominalTypeRef(uint8ArrayTypeId), cResultMode: 'value' }
  ),
  moduleCall(
    'randomInt',
    ['number', 'optional-number'],
    [],
    1,
    2,
    [numberArgument(), numberArgument()],
    randomRequirements,
    { resultTypeRef: primitiveTypeRef('number') }
  ),
  moduleCall('randomUUID', [], [], 0, 0, [], randomRequirements, {
    resultTypeRef: stringTypeRef,
    cResultMapping: stringResultMapping()
  }),
  moduleCall(
    'timingSafeEqual',
    ['value', 'value'],
    ['Uint8Array($value)', 'Uint8Array($value)'],
    2,
    2,
    [bytesArgument(), bytesArgument()],
    randomRequirements,
    { resultTypeRef: primitiveTypeRef('boolean') }
  ),
  moduleCall('createHash', ['string-view'], [], 1, 1, [sha256Argument('createHash')], hashRequirements, {
    resultTypeRef: nominalTypeRef(hashTypeId),
    cResultMode: 'value'
  }),
  moduleCall(
    'createHmac',
    ['string-view', 'string-view-or-value'],
    [],
    2,
    2,
    [sha256Argument('createHmac'), stringOrBytesArgument()],
    hashRequirements,
    { resultTypeRef: nominalTypeRef(hmacTypeId), cResultMode: 'value' }
  ),
  hashOperation(),
  updateOperation(hashTypeId),
  updateOperation(hmacTypeId),
  digestOperation(hashTypeId),
  digestOperation(hmacTypeId),
  ...unsupportedMethods().map(unsupportedOperation)
]

export const compilerLibraryPackage: CompilerLibraryPackageDescriptor = {
  id: libraryId,
  dependencies: ['global:crypto', 'global:binary', collectionsLibraryId, stringsLibraryId, 'node:buffer'],
  nativeTypes: [nativeType(hashTypeId, 'Hash'), nativeType(hmacTypeId, 'Hmac')],
  operations,
  intrinsicBindings: [],
  runtimeRequirements: [
    {
      id: runtimeRequirement,
      dependencies: [
        'global:crypto',
        'global:binary',
        arrayRuntimeRequirement,
        stringsRuntimeRequirement,
        'node:buffer',
        'managed-values',
        'string-bytes'
      ],
      cPreludeIncludes: ['inox/crypto.h'],
      capabilities: [],
      optionConstraints: [
        {
          optionId: 'target:runtime#loop-backend',
          allowedValues: ['libuv'],
          diagnosticCode: 'INOX_NOT_IMPLEMENTED',
          diagnosticMessage: 'node:crypto is not implemented for C without libuv; select --loop-backend libuv'
        }
      ]
    },
    {
      id: hashRuntimeRequirement,
      dependencies: [],
      cPreludeIncludes: ['inox/crypto.h'],
      capabilities: [],
      optionConstraints: [
        {
          optionId: 'target:runtime#tls-backend',
          allowedValues: ['boringssl', 'openssl'],
          diagnosticCode: 'INOX_NOT_IMPLEMENTED',
          diagnosticMessage:
            'node:crypto hash APIs require --tls-backend boringssl or --tls-backend openssl in the current C++ backend'
        }
      ]
    }
  ]
}

type ModuleCallOptions = {
  resultTypeRef: TypeRef
  cResultMapping?: LibraryCResultMappingDescriptor | null
  cResultMode?: LibraryCResultMode | null
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

function moduleCall(
  name: string,
  cArgumentKinds: LibraryCArgumentKind[],
  cArgumentAdapters: string[],
  minArgs: number,
  maxArgs: number,
  argumentChecks: LibraryArgumentCheckDescriptor[],
  requirements: string[],
  options: ModuleCallOptions
): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: moduleBinding(name),
    bindingAliases: [defaultMemberBinding(name)],
    operationId: `${libraryId}#${name}`,
    kind: 'call',
    runtimeRequirements: requirements,
    cExpression: `crypto.${name}`,
    cArgumentKinds,
    cArgumentAdapters,
    cArgumentAdapterTypeIds: cArgumentAdapters.map((adapter) => (adapter.length > 0 ? uint8ArrayTypeId : '')),
    cResultMode: options.cResultMode ?? null,
    cResultMapping: options.cResultMapping ?? null,
    resultTypeRef: options.resultTypeRef,
    cFailureMode: 'thrown',
    minArgs,
    maxArgs,
    argumentChecks
  }
}

function hashOperation(): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: moduleBinding('hash'),
    bindingAliases: [defaultMemberBinding('hash')],
    operationId: `${libraryId}#hash`,
    kind: 'call',
    runtimeRequirements: hashRequirements,
    cFailureMode: 'thrown',
    minArgs: 2,
    maxArgs: 3,
    argumentChecks: [
      sha256Argument('hash'),
      stringOrBytesArgument(),
      literalArgument(
        ['hex', 'base64', 'base64url', 'buffer'],
        "node:crypto hash only supports the 'hex', 'base64', 'base64url' and 'buffer' output encodings in the current C++ backend"
      )
    ],
    variants: [
      callVariant(2, 2, null, [], ['string-view', 'string-view-or-value'], stringTypeRef, stringResultMapping()),
      callVariant(
        3,
        3,
        2,
        ['hex', 'base64', 'base64url'],
        ['string-view', 'string-view-or-value', 'string-view'],
        stringTypeRef,
        stringResultMapping()
      ),
      callVariant(
        3,
        3,
        2,
        ['buffer'],
        ['string-view', 'string-view-or-value'],
        nominalTypeRef(bufferTypeId),
        null,
        'value',
        'crypto.hashBuffer'
      )
    ]
  }
}

function updateOperation(receiverTypeId: string): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: receiverBinding(receiverTypeId, 'update'),
    operationId: `${receiverTypeId}#update`,
    kind: 'call',
    runtimeRequirements: hashRequirements,
    receiverTypeId,
    cExpression: 'update',
    cCallStyle: 'member',
    cFailureMode: 'thrown',
    cResultMode: 'borrowed',
    resultTypeRef: nominalTypeRef(receiverTypeId, 'borrowed'),
    minArgs: 1,
    maxArgs: 2,
    argumentChecks: [stringOrBytesArgument(), encodingArgument()],
    variants: [
      receiverVariant(1, 1, ['receiver', 'string-view-or-value']),
      receiverVariant(2, 2, ['receiver', 'string-view-or-value', 'string-view'])
    ]
  }
}

function digestOperation(receiverTypeId: string): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: receiverBinding(receiverTypeId, 'digest'),
    operationId: `${receiverTypeId}#digest`,
    kind: 'call',
    runtimeRequirements: hashRequirements,
    receiverTypeId,
    cExpression: 'digest',
    cCallStyle: 'member',
    cFailureMode: 'thrown',
    minArgs: 0,
    maxArgs: 1,
    argumentChecks: [encodingArgument()],
    variants: [
      receiverScalarVariant(0, 0, null, [], ['receiver'], nominalTypeRef(bufferTypeId), null, 'value'),
      receiverScalarVariant(1, 1, null, [], ['receiver', 'string-view'], stringTypeRef, stringResultMapping())
    ]
  }
}

function callVariant(
  minArgs: number,
  maxArgs: number,
  argumentIndex: number | null,
  stringLiterals: string[],
  cArgumentKinds: LibraryCArgumentKind[],
  resultTypeRef: TypeRef,
  cResultMapping: LibraryCResultMappingDescriptor | null,
  cResultMode: LibraryCResultMode | null = null,
  cExpression = 'crypto.hash'
): LibraryOperationVariantDescriptor {
  return {
    minArgs,
    maxArgs,
    argumentIndex,
    stringLiterals,
    cExpression,
    cArgumentKinds,
    cResultMode,
    cResultMapping,
    resultTypeRef
  }
}

function receiverVariant(
  minArgs: number,
  maxArgs: number,
  cArgumentKinds: LibraryCArgumentKind[]
): LibraryOperationVariantDescriptor {
  return {
    minArgs,
    maxArgs,
    cExpression: 'update',
    cArgumentKinds
  }
}

function receiverScalarVariant(
  minArgs: number,
  maxArgs: number,
  argumentIndex: number | null,
  stringLiterals: string[],
  cArgumentKinds: LibraryCArgumentKind[],
  resultTypeRef: TypeRef,
  cResultMapping: LibraryCResultMappingDescriptor | null,
  cResultMode: LibraryCResultMode | null = null
): LibraryOperationVariantDescriptor {
  return {
    minArgs,
    maxArgs,
    argumentIndex,
    stringLiterals,
    cExpression: 'digest',
    cArgumentKinds,
    cResultMode,
    cResultMapping,
    resultTypeRef
  }
}

function nativeType(typeId: string, cppType: string) {
  return {
    libraryId,
    typeId,
    declarationNames: [cppType],
    valueType: 'object',
    cppType,
    baseTypeIds: [],
    runtimeRequirements: hashRequirements
  }
}

function nominalTypeRef(typeId: string, ownership: TypeOwnership = 'value'): NominalTypeRef {
  return {
    kind: 'nominal',
    typeId,
    args: [],
    nullable: false,
    ownership,
    traits: []
  }
}

function primitiveTypeRef(name: CorePrimitiveType): PrimitiveTypeRef {
  return {
    kind: 'primitive',
    name,
    nullable: false,
    ownership: 'value',
    traits: []
  }
}

function stringResultMapping(): LibraryCResultMappingDescriptor {
  return { cppType: 'inox::String', fields: [] }
}

function unsupportedOperation(name: string): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: moduleBinding(name),
    bindingAliases: [defaultMemberBinding(name)],
    operationId: `${libraryId}#unsupported:${name}`,
    kind: 'call',
    runtimeRequirements: [],
    cExpression: null,
    diagnosticCode: 'INOX_NOT_IMPLEMENTED',
    diagnosticMessage: `node:crypto ${name} is not implemented by the current C++ backend`
  }
}

function numberArgument(): LibraryArgumentCheckDescriptor {
  return { valueTypes: ['number'] }
}

function bytesArgument(): LibraryArgumentCheckDescriptor {
  return { valueTypes: ['bytes'] }
}

function stringOrBytesArgument(): LibraryArgumentCheckDescriptor {
  return { valueTypes: ['string', 'bytes'] }
}

function encodingArgument(): LibraryArgumentCheckDescriptor {
  return { valueTypes: ['string'] }
}

function sha256Argument(method: string): LibraryArgumentCheckDescriptor {
  return literalArgument(
    ['sha256'],
    `node:crypto ${method} only supports the 'sha256' algorithm in the current C++ backend`
  )
}

function literalArgument(values: string[], message: string): LibraryArgumentCheckDescriptor {
  return {
    valueTypes: ['string'],
    stringLiterals: values,
    literalDiagnosticCode: 'INOX_NOT_IMPLEMENTED',
    literalDiagnosticMessage: message
  }
}

function moduleBinding(name: string): string {
  return `${libraryId}#module:${libraryId}:${name}`
}

function defaultMemberBinding(name: string): string {
  return `${libraryId}#module:${libraryId}:default.${name}`
}

function receiverBinding(receiverTypeId: string, name: string): string {
  return `${receiverTypeId}.${name}`
}

function unsupportedMethods(): string[] {
  return [
    'argon2',
    'argon2Sync',
    'checkPrime',
    'checkPrimeSync',
    'createCipheriv',
    'createDecipheriv',
    'createDiffieHellman',
    'createDiffieHellmanGroup',
    'createECDH',
    'createPrivateKey',
    'createPublicKey',
    'createSecretKey',
    'createSign',
    'createVerify',
    'decapsulate',
    'diffieHellman',
    'encapsulate',
    'generateKey',
    'generateKeyPair',
    'generateKeyPairSync',
    'generateKeySync',
    'generatePrime',
    'generatePrimeSync',
    'getCipherInfo',
    'getCiphers',
    'getCurves',
    'getDiffieHellman',
    'getFips',
    'hkdf',
    'hkdfSync',
    'pbkdf2',
    'pbkdf2Sync',
    'privateDecrypt',
    'privateEncrypt',
    'publicDecrypt',
    'publicEncrypt',
    'randomFill',
    'randomUUIDv7',
    'scrypt',
    'scryptSync',
    'secureHeapUsed',
    'setEngine',
    'setFips',
    'sign',
    'verify'
  ]
}
