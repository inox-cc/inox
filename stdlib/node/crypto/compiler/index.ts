import type {
  CompilerLibraryPackageDescriptor,
  CorePrimitiveType,
  LibraryArgumentCheckDescriptor,
  LibraryCArgumentKind,
  LibraryCResultMappingDescriptor,
  LibraryCResultMode,
  LibraryOperationDescriptor,
  LibraryOperationVariantDescriptor,
  LibraryResultShapeFieldDescriptor,
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
const cipherRuntimeRequirement = 'node:crypto:cipher'
const signatureRuntimeRequirement = 'node:crypto:signature'
const hashTypeId = `${libraryId}#Hash`
const hmacTypeId = `${libraryId}#Hmac`
const cipherTypeId = `${libraryId}#Cipheriv`
const decipherTypeId = `${libraryId}#Decipheriv`
const keyObjectTypeId = `${libraryId}#KeyObject`
const uint8ArrayTypeId = 'global:binary#Uint8Array'
const bufferTypeId = 'node:buffer#Buffer'

const randomRequirements = [runtimeRequirement]
const hashRequirements = [runtimeRequirement, hashRuntimeRequirement]
const cipherRequirements = [runtimeRequirement, cipherRuntimeRequirement]
const signatureRequirements = [runtimeRequirement, signatureRuntimeRequirement]
const hashAlgorithms = ['sha1', 'sha224', 'sha256', 'sha384', 'sha512']
const cipherAlgorithms = ['aes-128-gcm', 'aes-192-gcm', 'aes-256-gcm']
const signatureAlgorithms = ['sha256', 'sha384', 'sha512']
const stringTypeRef = primitiveTypeRef('string')
const keyPairResultTypeRef: TypeRef = {
  kind: 'object',
  fields: [
    { name: 'publicKey', typeRef: nominalTypeRef(keyObjectTypeId), readonly: true },
    { name: 'privateKey', typeRef: nominalTypeRef(keyObjectTypeId), readonly: true }
  ],
  nullable: false,
  ownership: 'value',
  traits: []
}
const keyPairResultMapping: LibraryCResultMappingDescriptor = {
  cppType: 'CryptoKeyPair',
  fields: [
    { name: 'publicKey', cMember: 'publicKey', cppType: 'KeyObject' },
    { name: 'privateKey', cMember: 'privateKey', cppType: 'KeyObject' }
  ]
}

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
    'pbkdf2Sync',
    ['value', 'value', 'number', 'number', 'string-view'],
    [],
    5,
    5,
    [
      stringOrBytesArgument(),
      stringOrBytesArgument(),
      numberArgument(),
      numberArgument(),
      hashAlgorithmArgument('pbkdf2Sync')
    ],
    hashRequirements,
    { resultTypeRef: nominalTypeRef(bufferTypeId), cResultMode: 'value' }
  ),
  moduleCall(
    'hkdfSync',
    ['string-view', 'value', 'value', 'value', 'number'],
    [],
    5,
    5,
    [
      hashAlgorithmArgument('hkdfSync'),
      stringOrBytesArgument(),
      stringOrBytesArgument(),
      stringOrBytesArgument(),
      numberArgument()
    ],
    hashRequirements,
    { resultTypeRef: nominalTypeRef(bufferTypeId), cResultMode: 'value' }
  ),
  moduleCall(
    'scryptSync',
    ['value', 'value', 'number', 'optional-value'],
    [],
    3,
    4,
    [stringOrBytesArgument(), stringOrBytesArgument(), numberArgument(), objectArgument()],
    hashRequirements,
    { resultTypeRef: nominalTypeRef(bufferTypeId), cResultMode: 'value' }
  ),
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
  moduleCall(
    'createCipheriv',
    ['string-view', 'value', 'value', 'optional-value'],
    [],
    3,
    4,
    [cipherAlgorithmArgument('createCipheriv'), secretKeyInputArgument(), stringOrBytesArgument(), objectArgument()],
    cipherRequirements,
    { resultTypeRef: nominalTypeRef(cipherTypeId), cResultMode: 'value' }
  ),
  moduleCall(
    'createDecipheriv',
    ['string-view', 'value', 'value', 'optional-value'],
    [],
    3,
    4,
    [cipherAlgorithmArgument('createDecipheriv'), secretKeyInputArgument(), stringOrBytesArgument(), objectArgument()],
    cipherRequirements,
    { resultTypeRef: nominalTypeRef(decipherTypeId), cResultMode: 'value' }
  ),
  moduleCall('createPrivateKey', ['value'], [], 1, 1, [stringOrBytesArgument()], signatureRequirements, {
    resultTypeRef: nominalTypeRef(keyObjectTypeId),
    cResultMode: 'value'
  }),
  moduleCall('createPublicKey', ['value'], [], 1, 1, [publicKeyInputArgument()], signatureRequirements, {
    resultTypeRef: nominalTypeRef(keyObjectTypeId),
    cResultMode: 'value'
  }),
  createSecretKeyOperation(),
  rsaCryptOperation('privateDecrypt', privateKeyInputArgument()),
  rsaCryptOperation('publicEncrypt', publicKeyInputArgument()),
  moduleCall(
    'generateKeyPairSync',
    ['string-view', 'value'],
    [],
    2,
    2,
    [
      literalArgument(
        ['rsa', 'ec'],
        "node:crypto generateKeyPairSync only supports 'rsa' and 'ec' in the current C++ backend"
      ),
      objectArgument()
    ],
    signatureRequirements,
    { resultTypeRef: keyPairResultTypeRef, cResultMapping: keyPairResultMapping }
  ),
  moduleCall('createHash', ['string-view'], [], 1, 1, [hashAlgorithmArgument('createHash')], hashRequirements, {
    resultTypeRef: nominalTypeRef(hashTypeId),
    cResultMode: 'value'
  }),
  moduleCall(
    'createHmac',
    ['string-view', 'string-view-or-value'],
    [],
    2,
    2,
    [hashAlgorithmArgument('createHmac'), secretKeyInputArgument()],
    hashRequirements,
    { resultTypeRef: nominalTypeRef(hmacTypeId), cResultMode: 'value' }
  ),
  hashOperation(),
  updateOperation(hashTypeId),
  updateOperation(hmacTypeId),
  digestOperation(hashTypeId),
  digestOperation(hmacTypeId),
  cipherUpdateOperation(cipherTypeId, ['hex']),
  cipherUpdateOperation(decipherTypeId, ['hex', 'utf8', 'utf-8']),
  cipherFinalOperation(cipherTypeId, ['hex']),
  cipherFinalOperation(decipherTypeId, ['hex', 'utf8', 'utf-8']),
  cipherSetAadOperation(cipherTypeId),
  cipherSetAadOperation(decipherTypeId),
  cipherGetAuthTagOperation(),
  cipherSetAuthTagOperation(),
  keyExportOperation(),
  moduleCall(
    'sign',
    ['string-view', 'value', 'value'],
    [],
    3,
    3,
    [signatureAlgorithmArgument('sign'), stringOrBytesArgument(), privateKeyInputArgument()],
    signatureRequirements,
    { resultTypeRef: nominalTypeRef(bufferTypeId), cResultMode: 'value' }
  ),
  moduleCall(
    'verify',
    ['string-view', 'value', 'value', 'value'],
    [],
    4,
    4,
    [signatureAlgorithmArgument('verify'), stringOrBytesArgument(), publicKeyInputArgument(), bytesArgument()],
    signatureRequirements,
    { resultTypeRef: primitiveTypeRef('boolean') }
  ),
  ...unsupportedMethods().map(unsupportedOperation)
]

export const compilerLibraryPackage: CompilerLibraryPackageDescriptor = {
  id: libraryId,
  dependencies: ['global:crypto', 'global:binary', collectionsLibraryId, stringsLibraryId, 'node:buffer'],
  nativeTypes: [
    nativeType(hashTypeId, 'Hash', hashRequirements),
    nativeType(hmacTypeId, 'Hmac', hashRequirements),
    nativeType(cipherTypeId, 'Cipheriv', cipherRequirements),
    nativeType(decipherTypeId, 'Decipheriv', cipherRequirements),
    nativeType(keyObjectTypeId, 'KeyObject', randomRequirements, [
      {
        name: 'type',
        valueType: 'string',
        readonly: true,
        cGetter: 'type'
      },
      {
        name: 'asymmetricKeyType',
        valueType: 'string',
        nullable: true,
        cppType: 'inox::Value',
        readonly: true,
        cGetter: 'asymmetricKeyType'
      },
      {
        name: 'symmetricKeySize',
        valueType: 'number',
        nullable: true,
        cppType: 'inox::Value',
        readonly: true,
        cGetter: 'symmetricKeySize'
      }
    ])
  ],
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
        'objects',
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
    },
    {
      id: cipherRuntimeRequirement,
      dependencies: [],
      cPreludeIncludes: ['inox/crypto.h'],
      capabilities: [],
      optionConstraints: [
        {
          optionId: 'target:runtime#tls-backend',
          allowedValues: ['boringssl', 'openssl'],
          diagnosticCode: 'INOX_NOT_IMPLEMENTED',
          diagnosticMessage:
            'node:crypto cipher APIs require --tls-backend boringssl or --tls-backend openssl in the current C++ backend'
        }
      ]
    },
    {
      id: signatureRuntimeRequirement,
      dependencies: [],
      cPreludeIncludes: ['inox/crypto.h'],
      capabilities: [],
      optionConstraints: [
        {
          optionId: 'target:runtime#tls-backend',
          allowedValues: ['boringssl', 'openssl'],
          diagnosticCode: 'INOX_NOT_IMPLEMENTED',
          diagnosticMessage:
            'node:crypto signature APIs require --tls-backend boringssl or --tls-backend openssl in the current C++ backend'
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
      hashAlgorithmArgument('hash'),
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

function keyExportOperation(): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: receiverBinding(keyObjectTypeId, 'export'),
    operationId: `${keyObjectTypeId}#export`,
    kind: 'call',
    runtimeRequirements: signatureRequirements,
    receiverTypeId: keyObjectTypeId,
    cExpression: 'exportKey',
    cCallStyle: 'member',
    cFailureMode: 'thrown',
    minArgs: 0,
    maxArgs: 1,
    argumentChecks: [objectArgument()],
    variants: [
      {
        runtimeRequirements: randomRequirements,
        minArgs: 0,
        maxArgs: 0,
        cExpression: 'exportKey',
        cArgumentKinds: ['receiver'],
        cResultMode: 'value',
        resultTypeRef: nominalTypeRef(bufferTypeId)
      },
      {
        runtimeRequirements: signatureRequirements,
        minArgs: 1,
        maxArgs: 1,
        cExpression: 'exportKey',
        cArgumentKinds: ['receiver', 'value'],
        cResultMapping: stringResultMapping(),
        resultTypeRef: stringTypeRef
      }
    ]
  }
}

function createSecretKeyOperation(): LibraryOperationDescriptor {
  const resultTypeRef = nominalTypeRef(keyObjectTypeId)

  return {
    ...moduleCall(
      'createSecretKey',
      ['value'],
      [],
      1,
      2,
      [stringOrBytesArgument(), encodingArgument()],
      randomRequirements,
      { resultTypeRef, cResultMode: 'value' }
    ),
    variants: [
      {
        minArgs: 1,
        maxArgs: 1,
        cExpression: 'crypto.createSecretKey',
        cArgumentKinds: ['value'],
        cResultMode: 'value',
        resultTypeRef
      },
      {
        minArgs: 2,
        maxArgs: 2,
        cExpression: 'crypto.createSecretKey',
        cArgumentKinds: ['value', 'optional-string-view', 'argument-presence'],
        cResultMode: 'value',
        resultTypeRef
      }
    ]
  }
}

function rsaCryptOperation(
  name: 'privateDecrypt' | 'publicEncrypt',
  directKeyCheck: LibraryArgumentCheckDescriptor
): LibraryOperationDescriptor {
  const resultTypeRef = nominalTypeRef(bufferTypeId)

  return {
    ...moduleCall(name, ['value', 'value'], [], 2, 2, [directKeyCheck, bytesArgument()], signatureRequirements, {
      resultTypeRef,
      cResultMode: 'value'
    }),
    variants: [
      {
        minArgs: 2,
        maxArgs: 2,
        argumentIndex: 0,
        argumentValueTypes: ['object'],
        objectFieldName: 'key',
        cExpression: `crypto.${name}`,
        cArgumentKinds: [
          'value',
          'value',
          'object-string-field',
          'argument-presence',
          'optional-value',
          'argument-presence'
        ],
        cArgumentSources: [
          { argumentIndex: 0, objectFieldName: 'key' },
          { argumentIndex: 1 },
          { argumentIndex: 0, objectFieldName: 'oaepHash' },
          null,
          { argumentIndex: 0, objectFieldName: 'oaepLabel' },
          null
        ],
        argumentChecks: [rsaOaepOptionsArgument(directKeyCheck), bytesArgument()],
        cResultMode: 'value',
        resultTypeRef
      },
      {
        minArgs: 2,
        maxArgs: 2,
        cExpression: `crypto.${name}`,
        cArgumentKinds: ['value', 'value'],
        argumentChecks: [directKeyCheck, bytesArgument()],
        cResultMode: 'value',
        resultTypeRef
      }
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

function cipherUpdateOperation(receiverTypeId: string, outputEncodings: string[]): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: receiverBinding(receiverTypeId, 'update'),
    operationId: `${receiverTypeId}#update`,
    kind: 'call',
    runtimeRequirements: cipherRequirements,
    receiverTypeId,
    cExpression: 'update',
    cCallStyle: 'member',
    cFailureMode: 'thrown',
    minArgs: 1,
    maxArgs: 3,
    argumentChecks: [stringOrBytesArgument(), encodingArgument(), cipherOutputEncodingArgument(outputEncodings)],
    variants: [
      memberResultVariant(
        'update',
        1,
        1,
        null,
        [],
        ['receiver', 'string-view-or-value'],
        nominalTypeRef(bufferTypeId),
        null,
        'value'
      ),
      memberResultVariant(
        'update',
        2,
        2,
        null,
        [],
        ['receiver', 'string-view-or-value', 'string-view'],
        nominalTypeRef(bufferTypeId),
        null,
        'value'
      ),
      memberResultVariant(
        'update',
        3,
        3,
        2,
        outputEncodings,
        ['receiver', 'string-view-or-value', 'string-view', 'string-view'],
        stringTypeRef,
        stringResultMapping()
      )
    ]
  }
}

function cipherFinalOperation(receiverTypeId: string, outputEncodings: string[]): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: receiverBinding(receiverTypeId, 'final'),
    operationId: `${receiverTypeId}#final`,
    kind: 'call',
    runtimeRequirements: cipherRequirements,
    receiverTypeId,
    cExpression: 'final',
    cCallStyle: 'member',
    cFailureMode: 'thrown',
    minArgs: 0,
    maxArgs: 1,
    argumentChecks: [cipherOutputEncodingArgument(outputEncodings)],
    variants: [
      memberResultVariant('final', 0, 0, null, [], ['receiver'], nominalTypeRef(bufferTypeId), null, 'value'),
      memberResultVariant(
        'final',
        1,
        1,
        0,
        outputEncodings,
        ['receiver', 'string-view'],
        stringTypeRef,
        stringResultMapping()
      )
    ]
  }
}

function cipherSetAadOperation(receiverTypeId: string): LibraryOperationDescriptor {
  return borrowedCipherOperation(
    receiverTypeId,
    'setAAD',
    ['receiver', 'string-view-or-value', 'optional-value'],
    1,
    2,
    [stringOrBytesArgument(), objectArgument()]
  )
}

function cipherGetAuthTagOperation(): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: receiverBinding(cipherTypeId, 'getAuthTag'),
    operationId: `${cipherTypeId}#getAuthTag`,
    kind: 'call',
    runtimeRequirements: cipherRequirements,
    receiverTypeId: cipherTypeId,
    cExpression: 'getAuthTag',
    cArgumentKinds: ['receiver'],
    cCallStyle: 'member',
    cFailureMode: 'thrown',
    cResultMode: 'value',
    resultTypeRef: nominalTypeRef(bufferTypeId),
    minArgs: 0,
    maxArgs: 0,
    argumentChecks: []
  }
}

function cipherSetAuthTagOperation(): LibraryOperationDescriptor {
  return {
    ...borrowedCipherOperation(decipherTypeId, 'setAuthTag', ['receiver', 'string-view-or-value'], 1, 2, [
      stringOrBytesArgument(),
      encodingArgument()
    ]),
    variants: [
      memberVariant('setAuthTag', 1, 1, ['receiver', 'string-view-or-value']),
      memberVariant('setAuthTag', 2, 2, ['receiver', 'string-view-or-value', 'string-view'])
    ]
  }
}

function borrowedCipherOperation(
  receiverTypeId: string,
  name: string,
  cArgumentKinds: LibraryCArgumentKind[],
  minArgs: number,
  maxArgs: number,
  argumentChecks: LibraryArgumentCheckDescriptor[]
): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: receiverBinding(receiverTypeId, name),
    operationId: `${receiverTypeId}#${name}`,
    kind: 'call',
    runtimeRequirements: cipherRequirements,
    receiverTypeId,
    cExpression: name,
    cArgumentKinds,
    cCallStyle: 'member',
    cFailureMode: 'thrown',
    cResultMode: 'borrowed',
    resultTypeRef: nominalTypeRef(receiverTypeId, 'borrowed'),
    minArgs,
    maxArgs,
    argumentChecks
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

function memberVariant(
  cExpression: string,
  minArgs: number,
  maxArgs: number,
  cArgumentKinds: LibraryCArgumentKind[]
): LibraryOperationVariantDescriptor {
  return { minArgs, maxArgs, cExpression, cArgumentKinds }
}

function memberResultVariant(
  cExpression: string,
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
    cExpression,
    cArgumentKinds,
    cResultMode,
    cResultMapping,
    resultTypeRef
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

function nativeType(
  typeId: string,
  cppType: string,
  runtimeRequirements: string[],
  fields: LibraryResultShapeFieldDescriptor[] = []
) {
  return {
    libraryId,
    typeId,
    declarationNames: [cppType],
    valueType: 'object',
    cppType,
    baseTypeIds: [],
    runtimeRequirements,
    fields
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

function objectArgument(): LibraryArgumentCheckDescriptor {
  return { valueTypes: ['object'] }
}

function encodingArgument(): LibraryArgumentCheckDescriptor {
  return { valueTypes: ['string'] }
}

function hashAlgorithmArgument(method: string): LibraryArgumentCheckDescriptor {
  return literalArgument(
    hashAlgorithms,
    `node:crypto ${method} only supports 'sha1', 'sha224', 'sha256', 'sha384' and 'sha512' in the current C++ backend`
  )
}

function cipherAlgorithmArgument(method: string): LibraryArgumentCheckDescriptor {
  return literalArgument(
    cipherAlgorithms,
    `node:crypto ${method} only supports 'aes-128-gcm', 'aes-192-gcm' and 'aes-256-gcm' in the current C++ backend`
  )
}

function cipherOutputEncodingArgument(values: string[]): LibraryArgumentCheckDescriptor {
  return literalArgument(
    values,
    `node:crypto cipher output only supports ${values.map((value) => `'${value}'`).join(', ')} in the current C++ backend`
  )
}

function signatureAlgorithmArgument(method: string): LibraryArgumentCheckDescriptor {
  return literalArgument(
    signatureAlgorithms,
    `node:crypto ${method} only supports 'sha256', 'sha384' and 'sha512' in the current C++ backend`
  )
}

function privateKeyInputArgument(): LibraryArgumentCheckDescriptor {
  return {
    valueTypes: ['string', 'bytes', 'object'],
    objectTypeIds: [keyObjectTypeId]
  }
}

function publicKeyInputArgument(): LibraryArgumentCheckDescriptor {
  return privateKeyInputArgument()
}

function secretKeyInputArgument(): LibraryArgumentCheckDescriptor {
  return privateKeyInputArgument()
}

function rsaOaepOptionsArgument(keyCheck: LibraryArgumentCheckDescriptor): LibraryArgumentCheckDescriptor {
  return {
    valueTypes: ['object'],
    objectLiteralFields: [
      {
        name: 'key',
        valueTypes: keyCheck.valueTypes ?? [],
        objectTypeIds: keyCheck.objectTypeIds
      },
      {
        name: 'oaepHash',
        valueTypes: ['string'],
        stringLiterals: hashAlgorithms,
        optional: true
      },
      {
        name: 'oaepLabel',
        valueTypes: ['string', 'bytes'],
        optional: true
      }
    ]
  }
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
    'createDiffieHellman',
    'createDiffieHellmanGroup',
    'createECDH',
    'createSign',
    'createVerify',
    'decapsulate',
    'diffieHellman',
    'encapsulate',
    'generateKey',
    'generateKeyPair',
    'generateKeySync',
    'generatePrime',
    'generatePrimeSync',
    'getCipherInfo',
    'getCiphers',
    'getCurves',
    'getDiffieHellman',
    'getFips',
    'hkdf',
    'pbkdf2',
    'privateEncrypt',
    'publicDecrypt',
    'randomFill',
    'randomUUIDv7',
    'scrypt',
    'secureHeapUsed',
    'setEngine',
    'setFips'
  ]
}
