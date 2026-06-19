import assert from 'node:assert/strict'
import test from 'node:test'
import {
  arrayElementTypeNameFromTypeName,
  arrayElementTypeNameFromKnownTypeName,
  isBuiltinValueType,
  isArrayTypeName,
  isBytesTypeName,
  isNullableTypeName,
  isPromiseTypeName,
  isSetTypeName,
  mapTypeNamesFromTypeName,
  nullableTypeNameFromTypeName,
  nullableTypeNameFromKnownTypeName,
  promiseValueTypeNameFromTypeName,
  promiseValueTypeNameFromKnownTypeName,
  setElementTypeNameFromKnownTypeName,
  setElementTypeNameFromTypeName,
  splitGenericArgs,
  splitUnionArgs
} from '../compiler/type-names.ts'

test('splits nested generic type arguments', () => {
  assert.deepEqual(splitGenericArgs('string, Array<number>, Map<string, Array<boolean>>'), [
    'string',
    'Array<number>',
    'Map<string, Array<boolean>>'
  ])
})

test('splits top-level union type arguments', () => {
  assert.deepEqual(splitUnionArgs('string | null | Array<number | null>'), [
    'string',
    'null',
    'Array<number | null>'
  ])
})

test('extracts collection and promise type names', () => {
  assert.equal(arrayElementTypeNameFromTypeName('array<number>'), 'number')
  assert.equal(nullableTypeNameFromTypeName('nullable<string>'), 'string')
  assert.deepEqual(mapTypeNamesFromTypeName('map<string,array<number>>'), {
    key: 'string',
    value: 'array<number>'
  })
  assert.equal(setElementTypeNameFromTypeName('set<boolean>'), 'boolean')
  assert.equal(promiseValueTypeNameFromTypeName('promise<object>'), 'object')
})

test('recognizes known collection and nullable type names', () => {
  assert.equal(isNullableTypeName('nullable<string>'), true)
  assert.equal(nullableTypeNameFromKnownTypeName('nullable<string>'), 'string')
  assert.equal(isArrayTypeName('array<number>'), true)
  assert.equal(arrayElementTypeNameFromKnownTypeName('array<number>'), 'number')
  assert.equal(isSetTypeName('set<boolean>'), true)
  assert.equal(setElementTypeNameFromKnownTypeName('set<boolean>'), 'boolean')
  assert.equal(isPromiseTypeName('promise<object>'), true)
  assert.equal(promiseValueTypeNameFromKnownTypeName('promise<object>'), 'object')
})

test('returns null for malformed generic type names', () => {
  assert.equal(isArrayTypeName('array<>'), false)
  assert.equal(isNullableTypeName('nullable<>'), false)
  assert.equal(mapTypeNamesFromTypeName('map<string>'), null)
  assert.equal(setElementTypeNameFromTypeName('set<string,number>'), null)
  assert.equal(promiseValueTypeNameFromTypeName('promise<string,number>'), null)
})

test('recognizes builtin and bytes type names', () => {
  assert.equal(isBuiltinValueType('number'), true)
  assert.equal(isBuiltinValueType('unknown'), false)
  assert.equal(isBytesTypeName('Buffer'), true)
  assert.equal(isBytesTypeName('Uint8Array'), true)
  assert.equal(isBytesTypeName('ArrayBuffer'), false)
})
