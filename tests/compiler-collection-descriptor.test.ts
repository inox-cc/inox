import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  arrayRuntimeMethodName,
  collectionConstructorNameFromPath,
  isCollectionConstructorGlobalUsagePath,
  isStringPredicateMethod,
  mapRuntimeMethodName,
  setRuntimeMethodName,
  stringRuntimeMethodName,
  stringRuntimeReturnType
} from '../src/compiler/stdlib/descriptors/collections.ts'

test('maps array and collection constructors to runtime metadata', () => {
  assert.equal(arrayRuntimeMethodName('push'), 'push')
  assert.equal(arrayRuntimeMethodName('map'), 'map')
  assert.equal(arrayRuntimeMethodName('flatMap'), null)

  assert.equal(collectionConstructorNameFromPath(['Map']), 'Map')
  assert.equal(collectionConstructorNameFromPath(['Set']), 'Set')
  assert.equal(collectionConstructorNameFromPath(['WeakMap']), null)
  assert.equal(isCollectionConstructorGlobalUsagePath(['Map']), true)
  assert.equal(isCollectionConstructorGlobalUsagePath(['Array']), false)
})

test('maps Map and Set methods to runtime metadata', () => {
  assert.equal(mapRuntimeMethodName('get'), 'get')
  assert.equal(mapRuntimeMethodName('set'), 'set')
  assert.equal(mapRuntimeMethodName('entries'), null)

  assert.equal(setRuntimeMethodName('add'), 'add')
  assert.equal(setRuntimeMethodName('has'), 'has')
  assert.equal(setRuntimeMethodName('values'), null)
})

test('maps string runtime methods and return types', () => {
  assert.equal(stringRuntimeMethodName('trim'), 'trim')
  assert.equal(stringRuntimeMethodName('split'), 'split')
  assert.equal(stringRuntimeMethodName('includes'), 'includes')
  assert.equal(stringRuntimeMethodName('match'), null)

  assert.equal(isStringPredicateMethod('startsWith'), true)
  assert.equal(isStringPredicateMethod('slice'), false)
  assert.equal(stringRuntimeReturnType('split'), 'array')
  assert.equal(stringRuntimeReturnType('endsWith'), 'boolean')
  assert.equal(stringRuntimeReturnType('trim'), 'string')
  assert.equal(stringRuntimeReturnType('match'), null)
})
