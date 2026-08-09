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
    nativeType('node:crypto#Hash', 'Hash'),
    nativeType('node:crypto#Hmac', 'Hmac')
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
    ['node:crypto#timingSafeEqual', [result(primitiveType('boolean'))]],
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

function stringMapping(): LibraryCResultMappingDescriptor {
  return { cppType: 'inox::String', fields: [] }
}

function nativeType(typeId: string, cppType: string) {
  return {
    libraryId: 'node:crypto',
    typeId,
    declarationNames: [cppType],
    valueType: 'object',
    cppType,
    baseTypeIds: [],
    runtimeRequirements: ['node:crypto', 'node:crypto:hash']
  }
}
