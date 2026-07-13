import type {
  CompilerLibraryPackageDescriptor,
  LibraryArgumentCheckDescriptor,
  LibraryCArgumentKind,
  LibraryOperationDescriptor,
  LibraryOperationVariantDescriptor
} from '../../../../compiler/extensions/types.ts'

const libraryId = 'node:crypto'
const runtimeRequirement = 'node:crypto'
const hashRuntimeRequirement = 'node:crypto:hash'
const hashTypeId = `${libraryId}#Hash`
const hmacTypeId = `${libraryId}#Hmac`
const uint8ArrayTypeId = 'global:binary#Uint8Array'
const bufferTypeId = 'node:buffer#Buffer'

const randomRequirements = [runtimeRequirement]
const hashRequirements = [runtimeRequirement, hashRuntimeRequirement]

const operations: LibraryOperationDescriptor[] = [
  moduleCall('getHashes', [], [], 'Array', 'array', 0, 0, [], hashRequirements, {
    resultArrayElementType: 'string'
  }),
  moduleCall(
    'getRandomValues',
    ['value'],
    ['Uint8Array($value)'],
    'Uint8Array',
    'bytes',
    1,
    1,
    [bytesArgument()],
    randomRequirements,
    { resultTypeId: uint8ArrayTypeId }
  ),
  moduleCall(
    'randomBytes',
    ['number'],
    [],
    'Buffer',
    'bytes',
    1,
    1,
    [numberArgument()],
    randomRequirements,
    { resultTypeId: bufferTypeId }
  ),
  moduleCall(
    'randomFillSync',
    ['value', 'optional-number', 'optional-number'],
    ['Uint8Array($value)'],
    'Uint8Array',
    'bytes',
    1,
    3,
    [bytesArgument(), numberArgument(), numberArgument()],
    randomRequirements,
    { resultTypeId: uint8ArrayTypeId }
  ),
  moduleCall(
    'randomInt',
    ['number', 'optional-number'],
    [],
    'double',
    'number',
    1,
    2,
    [numberArgument(), numberArgument()],
    randomRequirements
  ),
  moduleCall('randomUUID', [], [], 'inox::String', 'string', 0, 0, [], randomRequirements),
  moduleCall(
    'timingSafeEqual',
    ['value', 'value'],
    ['Uint8Array($value)', 'Uint8Array($value)'],
    'bool',
    'boolean',
    2,
    2,
    [bytesArgument(), bytesArgument()],
    randomRequirements
  ),
  moduleCall(
    'createHash',
    ['string-view'],
    [],
    'Hash',
    'object',
    1,
    1,
    [sha256Argument('createHash')],
    hashRequirements,
    { resultTypeId: hashTypeId }
  ),
  moduleCall(
    'createHmac',
    ['string-view', 'string-view-or-value'],
    [],
    'Hmac',
    'object',
    2,
    2,
    [sha256Argument('createHmac'), stringOrBytesArgument()],
    hashRequirements,
    { resultTypeId: hmacTypeId }
  ),
  hashOperation(),
  updateOperation(hashTypeId, 'Hash'),
  updateOperation(hmacTypeId, 'Hmac'),
  digestOperation(hashTypeId, 'Hash'),
  digestOperation(hmacTypeId, 'Hmac'),
  ...unsupportedMethods().map(unsupportedOperation)
]

export const compilerLibraryPackage: CompilerLibraryPackageDescriptor = {
  id: libraryId,
  dependencies: ['global:crypto', 'global:binary', 'node:buffer'],
  operations,
  intrinsicBindings: [],
  runtimeRequirements: [
    {
      id: runtimeRequirement,
      dependencies: ['binary', 'collections', 'managed-values', 'string-bytes'],
      cPreludeIncludes: ['inox/crypto.h'],
      capabilities: [],
      backendConstraints: [
        {
          option: 'loopBackend',
          allowedValues: ['libuv'],
          diagnosticCode: 'INOX_NOT_IMPLEMENTED',
          diagnosticMessage:
            "node:crypto is not implemented for C without libuv; compile with loopBackend: 'libuv' or --loop-backend libuv"
        }
      ]
    },
    {
      id: hashRuntimeRequirement,
      dependencies: [],
      cPreludeIncludes: ['inox/crypto.h'],
      capabilities: [],
      backendConstraints: [
        {
          option: 'tlsBackend',
          allowedValues: ['boringssl', 'openssl'],
          diagnosticCode: 'INOX_NOT_IMPLEMENTED',
          diagnosticMessage:
            "node:crypto hash APIs require tlsBackend: 'boringssl' or 'openssl' in the current C++ backend"
        }
      ]
    }
  ]
}

type ModuleCallOptions = {
  resultArrayElementType?: string
  resultTypeId?: string
}

function moduleCall(
  name: string,
  cArgumentKinds: LibraryCArgumentKind[],
  cArgumentAdapters: string[],
  cppType: string,
  valueType: string,
  minArgs: number,
  maxArgs: number,
  argumentChecks: LibraryArgumentCheckDescriptor[],
  requirements: string[],
  options: ModuleCallOptions = {}
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
    cResultMode: options.resultTypeId ? 'value' : null,
    resultArrayElementType: options.resultArrayElementType,
    resultTypeId: options.resultTypeId,
    cFailureMode: 'thrown',
    minArgs,
    maxArgs,
    argumentChecks,
    cppType,
    valueType,
    nullable: false,
    owned: false
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
        ['hex', 'buffer'],
        "node:crypto hash only supports the 'hex' and 'buffer' output encodings in the current C++ backend"
      )
    ],
    variants: [
      callVariant(2, 2, null, [], ['string-view', 'string-view-or-value'], 'inox::String', 'string'),
      callVariant(3, 3, 2, ['hex'], ['string-view', 'string-view-or-value'], 'inox::String', 'string'),
      callVariant(
        3,
        3,
        2,
        ['buffer'],
        ['string-view', 'string-view-or-value', 'string-view'],
        'Buffer',
        'bytes',
        bufferTypeId
      )
    ]
  }
}

function updateOperation(receiverTypeId: string, label: string): LibraryOperationDescriptor {
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
    resultTypeId: receiverTypeId,
    minArgs: 1,
    maxArgs: 2,
    argumentChecks: [
      stringOrBytesArgument(),
      literalArgument(
        ['utf8'],
        `node:crypto ${label}.update only supports the 'utf8' input encoding in the current C++ backend`
      )
    ],
    variants: [
      receiverVariant(1, 1, ['receiver', 'string-view-or-value'], label, receiverTypeId, 'borrowed'),
      receiverVariant(
        2,
        2,
        ['receiver', 'string-view-or-value', 'string-view'],
        label,
        receiverTypeId,
        'borrowed'
      )
    ],
    cppType: label,
    valueType: 'object',
    nullable: false,
    owned: false
  }
}

function digestOperation(receiverTypeId: string, label: string): LibraryOperationDescriptor {
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
    argumentChecks: [
      literalArgument(
        ['hex'],
        `node:crypto ${label}.digest only supports the 'hex' encoding in the current C++ backend`
      )
    ],
    variants: [
      receiverScalarVariant(0, 0, null, [], ['receiver'], 'Buffer', 'bytes', bufferTypeId),
      receiverScalarVariant(1, 1, 0, ['hex'], ['receiver', 'string-view'], 'inox::String', 'string')
    ]
  }
}

function callVariant(
  minArgs: number,
  maxArgs: number,
  argumentIndex: number | null,
  stringLiterals: string[],
  cArgumentKinds: LibraryCArgumentKind[],
  cppType: string,
  valueType: string,
  resultTypeId?: string
): LibraryOperationVariantDescriptor {
  return {
    minArgs,
    maxArgs,
    argumentIndex,
    stringLiterals,
    cExpression: 'crypto.hash',
    cArgumentKinds,
    cResultMode: resultTypeId ? 'value' : null,
    resultTypeId,
    cppType,
    valueType,
    nullable: false,
    owned: false
  }
}

function receiverVariant(
  minArgs: number,
  maxArgs: number,
  cArgumentKinds: LibraryCArgumentKind[],
  cppType: string,
  resultTypeId: string,
  cResultMode: 'borrowed'
): LibraryOperationVariantDescriptor {
  return {
    minArgs,
    maxArgs,
    cExpression: 'update',
    cArgumentKinds,
    cResultMode,
    resultTypeId,
    cppType,
    valueType: 'object',
    nullable: false,
    owned: false
  }
}

function receiverScalarVariant(
  minArgs: number,
  maxArgs: number,
  argumentIndex: number | null,
  stringLiterals: string[],
  cArgumentKinds: LibraryCArgumentKind[],
  cppType: string,
  valueType: string,
  resultTypeId?: string
): LibraryOperationVariantDescriptor {
  return {
    minArgs,
    maxArgs,
    argumentIndex,
    stringLiterals,
    cExpression: 'digest',
    cArgumentKinds,
    cResultMode: resultTypeId ? 'value' : null,
    resultTypeId,
    cppType,
    valueType,
    nullable: false,
    owned: false
  }
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
    cppType: null,
    valueType: null,
    owned: false,
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
