import assert from 'node:assert/strict'
import test from 'node:test'
import {
  arrayElementTypeNameFromTypeName,
  isBuiltinValueType,
  isBytesTypeName,
  mapTypeNamesFromTypeName,
  nullableTypeNameFromTypeName,
  promiseValueTypeNameFromTypeName,
  setElementTypeNameFromTypeName,
  splitGenericArgs,
  splitUnionArgs
} from '../src/compiler/type-names.ts'

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

test('returns null for malformed generic type names', () => {
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
