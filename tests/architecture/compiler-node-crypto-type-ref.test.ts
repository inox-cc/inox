import assert from 'node:assert/strict'
import { test } from 'node:test'

import type {
  LibraryCResultMappingDescriptor,
  LibraryOperationDescriptor,
  TypeOwnership,
  TypeRef
} from '../../compiler/extensions/types.ts'
import { compilerLibraryPackage } from '../../stdlib/node/crypto/compiler/index.ts'

type EffectiveResult = {
  resultTypeRef: TypeRef
  cResultMapping: LibraryCResultMappingDescriptor | null
  cResultMode: string | null
}

const legacyResultFields = [
  'resultShapeFields',
  'resultArrayElementType',
  'resultArrayElementTypeId',
  'resultTypeId',
  'cppType',
  'valueType',
  'promiseValueType',
  'promiseRejectionValueType',
  'nullable',
  'owned'
]

test('node:crypto implemented results принадлежат TypeRef, включая Array<string> и variants', () => {
  assert.deepEqual(compilerLibraryPackage.dependencies, [
    'global:crypto',
    'global:binary',
    'global:collections',
    'global:strings',
    'node:buffer'
  ])
  assert.deepEqual(compilerLibraryPackage.nativeTypes, [
    nativeType('node:crypto#Hash', 'Hash', ['node:crypto', 'node:crypto:hash']),
    nativeType('node:crypto#Hmac', 'Hmac', ['node:crypto', 'node:crypto:hash']),
    nativeType('node:crypto#Cipheriv', 'Cipheriv', ['node:crypto', 'node:crypto:cipher']),
    nativeType('node:crypto#Decipheriv', 'Decipheriv', ['node:crypto', 'node:crypto:cipher']),
    nativeType(
      'node:crypto#KeyObject',
      'KeyObject',
      ['node:crypto', 'node:crypto:signature'],
      [field('type', 'type'), field('asymmetricKeyType', 'asymmetricKeyType')]
    )
  ])

  const stringType = primitiveType('string')
  const expected = new Map<string, EffectiveResult[]>([
    ['node:crypto#getHashes', [result(arrayType(stringType), null, 'value')]],
    ['node:crypto#getRandomValues', [result(nominalType('global:binary#Uint8Array'), null, 'value')]],
    ['node:crypto#randomBytes', [result(nominalType('node:buffer#Buffer'), null, 'value')]],
    ['node:crypto#randomFillSync', [result(nominalType('global:binary#Uint8Array'), null, 'value')]],
    ['node:crypto#randomInt', [result(primitiveType('number'))]],
    ['node:crypto#randomUUID', [result(stringType, stringMapping())]],
    ['node:crypto#pbkdf2Sync', [result(nominalType('node:buffer#Buffer'), null, 'value')]],
    ['node:crypto#hkdfSync', [result(nominalType('node:buffer#Buffer'), null, 'value')]],
    ['node:crypto#scryptSync', [result(nominalType('node:buffer#Buffer'), null, 'value')]],
    ['node:crypto#timingSafeEqual', [result(primitiveType('boolean'))]],
    ['node:crypto#createCipheriv', [result(nominalType('node:crypto#Cipheriv'), null, 'value')]],
    ['node:crypto#createDecipheriv', [result(nominalType('node:crypto#Decipheriv'), null, 'value')]],
    ['node:crypto#createPrivateKey', [result(nominalType('node:crypto#KeyObject'), null, 'value')]],
    ['node:crypto#createPublicKey', [result(nominalType('node:crypto#KeyObject'), null, 'value')]],
    [
      'node:crypto#generateKeyPairSync',
      [
        result(keyPairType(), {
          cppType: 'CryptoKeyPair',
          fields: [
            { name: 'publicKey', cMember: 'publicKey', cppType: 'KeyObject' },
            { name: 'privateKey', cMember: 'privateKey', cppType: 'KeyObject' }
          ]
        })
      ]
    ],
    ['node:crypto#createHash', [result(nominalType('node:crypto#Hash'), null, 'value')]],
    ['node:crypto#createHmac', [result(nominalType('node:crypto#Hmac'), null, 'value')]],
    [
      'node:crypto#hash',
      [
        result(stringType, stringMapping()),
        result(stringType, stringMapping()),
        result(nominalType('node:buffer#Buffer'), null, 'value')
      ]
    ],
    [
      'node:crypto#Hash#update',
      [
        result(nominalType('node:crypto#Hash', 'borrowed'), null, 'borrowed'),
        result(nominalType('node:crypto#Hash', 'borrowed'), null, 'borrowed')
      ]
    ],
    [
      'node:crypto#Hmac#update',
      [
        result(nominalType('node:crypto#Hmac', 'borrowed'), null, 'borrowed'),
        result(nominalType('node:crypto#Hmac', 'borrowed'), null, 'borrowed')
      ]
    ],
    [
      'node:crypto#Hash#digest',
      [result(nominalType('node:buffer#Buffer'), null, 'value'), result(stringType, stringMapping())]
    ],
    [
      'node:crypto#Hmac#digest',
      [result(nominalType('node:buffer#Buffer'), null, 'value'), result(stringType, stringMapping())]
    ],
    [
      'node:crypto#Cipheriv#update',
      [
        result(nominalType('node:buffer#Buffer'), null, 'value'),
        result(nominalType('node:buffer#Buffer'), null, 'value'),
        result(stringType, stringMapping())
      ]
    ],
    [
      'node:crypto#Decipheriv#update',
      [
        result(nominalType('node:buffer#Buffer'), null, 'value'),
        result(nominalType('node:buffer#Buffer'), null, 'value'),
        result(stringType, stringMapping())
      ]
    ],
    [
      'node:crypto#Cipheriv#final',
      [result(nominalType('node:buffer#Buffer'), null, 'value'), result(stringType, stringMapping())]
    ],
    [
      'node:crypto#Decipheriv#final',
      [result(nominalType('node:buffer#Buffer'), null, 'value'), result(stringType, stringMapping())]
    ],
    ['node:crypto#Cipheriv#setAAD', [result(nominalType('node:crypto#Cipheriv', 'borrowed'), null, 'borrowed')]],
    ['node:crypto#Decipheriv#setAAD', [result(nominalType('node:crypto#Decipheriv', 'borrowed'), null, 'borrowed')]],
    ['node:crypto#Cipheriv#getAuthTag', [result(nominalType('node:buffer#Buffer'), null, 'value')]],
    ['node:crypto#sign', [result(nominalType('node:buffer#Buffer'), null, 'value')]],
    ['node:crypto#verify', [result(primitiveType('boolean'))]],
    ['node:crypto#KeyObject#export', [result(stringType, stringMapping())]],
    [
      'node:crypto#Decipheriv#setAuthTag',
      [
        result(nominalType('node:crypto#Decipheriv', 'borrowed'), null, 'borrowed'),
        result(nominalType('node:crypto#Decipheriv', 'borrowed'), null, 'borrowed')
      ]
    ]
  ])
  const implemented = compilerLibraryPackage.operations.filter((operation) => !operation.diagnosticCode)

  assert.equal(implemented.length, expected.size)

  for (const operation of implemented) {
    assert.deepEqual(effectiveResults(operation), expected.get(operation.operationId))
    assertNoLegacyResultMetadata(operation)
  }
})

function effectiveResults(operation: LibraryOperationDescriptor): EffectiveResult[] {
  const variants = operation.variants ?? []

  if (variants.length === 0) {
    return [resultValue(operation.resultTypeRef, operation.cResultMapping, operation.cResultMode)]
  }

  return variants.map((variant) =>
    resultValue(
      variant.resultTypeRef ?? operation.resultTypeRef,
      variant.cResultMapping ?? operation.cResultMapping,
      variant.cResultMode ?? operation.cResultMode
    )
  )
}

function resultValue(
  resultTypeRef: TypeRef | null | undefined,
  cResultMapping: LibraryCResultMappingDescriptor | null | undefined,
  cResultMode: string | null | undefined
): EffectiveResult {
  assert.ok(resultTypeRef)
  return result(resultTypeRef, cResultMapping ?? null, cResultMode ?? null)
}

function assertNoLegacyResultMetadata(operation: LibraryOperationDescriptor): void {
  for (const field of legacyResultFields) {
    assert.equal(Object.prototype.hasOwnProperty.call(operation, field), false)
  }

  for (const variant of operation.variants ?? []) {
    for (const field of legacyResultFields) {
      assert.equal(Object.prototype.hasOwnProperty.call(variant, field), false)
    }
  }
}

function result(
  resultTypeRef: TypeRef,
  cResultMapping: LibraryCResultMappingDescriptor | null = null,
  cResultMode: string | null = null
): EffectiveResult {
  return { resultTypeRef, cResultMapping, cResultMode }
}

function primitiveType(name: 'boolean' | 'number' | 'string'): TypeRef {
  return { kind: 'primitive', name, nullable: false, ownership: 'value', traits: [] }
}

function nominalType(typeId: string, ownership: TypeOwnership = 'value'): TypeRef {
  return { kind: 'nominal', typeId, args: [], nullable: false, ownership, traits: [] }
}

function arrayType(elementType: TypeRef): TypeRef {
  return {
    kind: 'nominal',
    typeId: 'global:collections#Array',
    args: [elementType],
    nullable: false,
    ownership: 'value',
    traits: [{ traitId: 'iterable', args: [elementType] }]
  }
}

function keyPairType(): TypeRef {
  return {
    kind: 'object',
    fields: [
      { name: 'publicKey', typeRef: nominalType('node:crypto#KeyObject'), readonly: true },
      { name: 'privateKey', typeRef: nominalType('node:crypto#KeyObject'), readonly: true }
    ],
    nullable: false,
    ownership: 'value',
    traits: []
  }
}

function stringMapping(): LibraryCResultMappingDescriptor {
  return { cppType: 'inox::String', fields: [] }
}

function nativeType(
  typeId: string,
  cppType: string,
  runtimeRequirements: string[],
  fields: Array<{
    name: string
    valueType: string
    readonly: boolean
    cGetter: string
  }> = []
) {
  return {
    libraryId: 'node:crypto',
    typeId,
    declarationNames: [cppType],
    valueType: 'object',
    cppType,
    baseTypeIds: [],
    runtimeRequirements,
    fields
  }
}

function field(name: string, cGetter: string) {
  return { name, valueType: 'string', readonly: true, cGetter }
}
