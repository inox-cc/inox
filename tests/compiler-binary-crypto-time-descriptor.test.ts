import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  binaryConstructorNameFromPath,
  binaryInstanceRuntimeMethodName,
  binaryRuntimeReturnType,
  binaryStaticRuntimeMethodNameFromPath,
  isBinaryGlobalUsagePath
} from '../compiler/stdlib/descriptors/binary.ts'
import { cryptoRuntimeMethodNameFromPath } from '../compiler/stdlib/descriptors/crypto.ts'
import {
  timeRuntimeCFunctionNameFromPath,
  timeRuntimeCapabilityFromPath,
  timeRuntimeMethodNameFromPath
} from '../compiler/stdlib/descriptors/time.ts'

test('maps binary constructors and methods to runtime metadata', () => {
  assert.equal(binaryStaticRuntimeMethodNameFromPath(['Buffer', 'from']), 'from')
  assert.equal(binaryStaticRuntimeMethodNameFromPath(['Buffer', 'alloc']), 'alloc')
  assert.equal(binaryStaticRuntimeMethodNameFromPath(['Buffer', 'concat']), null)
  assert.equal(binaryStaticRuntimeMethodNameFromPath(['OtherBuffer', 'from']), null)

  assert.equal(binaryInstanceRuntimeMethodName('slice'), 'slice')
  assert.equal(binaryInstanceRuntimeMethodName('toString'), 'toString')
  assert.equal(binaryInstanceRuntimeMethodName('subarray'), null)

  assert.equal(binaryConstructorNameFromPath(['Uint8Array']), 'Uint8Array')
  assert.equal(binaryConstructorNameFromPath(['ArrayBuffer']), null)
  assert.equal(isBinaryGlobalUsagePath(['Buffer', 'from']), true)
  assert.equal(isBinaryGlobalUsagePath(['Uint8Array']), true)
  assert.equal(isBinaryGlobalUsagePath(['Buffer', 'concat']), false)

  assert.equal(binaryRuntimeReturnType('from'), 'bytes')
  assert.equal(binaryRuntimeReturnType('toString'), 'string')
  assert.equal(binaryRuntimeReturnType('subarray'), null)
})

test('maps crypto globals to runtime methods', () => {
  assert.equal(cryptoRuntimeMethodNameFromPath(['crypto', 'getRandomValues']), 'getRandomValues')
  assert.equal(cryptoRuntimeMethodNameFromPath(['crypto', 'randomUUID']), null)
  assert.equal(cryptoRuntimeMethodNameFromPath(['otherCrypto', 'getRandomValues']), null)
})

test('maps time globals to runtime methods and C functions', () => {
  assert.equal(timeRuntimeMethodNameFromPath(['Date', 'now']), 'dateNow')
  assert.equal(timeRuntimeCFunctionNameFromPath(['Date', 'now']), 'inox_date_now')
  assert.deepEqual(timeRuntimeCapabilityFromPath(['Date', 'now']), {
    key: 'wallClock',
    name: 'wall-clock'
  })

  assert.equal(timeRuntimeMethodNameFromPath(['performance', 'now']), 'performanceNow')
  assert.equal(timeRuntimeCFunctionNameFromPath(['performance', 'now']), 'inox_performance_now')
  assert.deepEqual(timeRuntimeCapabilityFromPath(['performance', 'now']), {
    key: 'monotonicClock',
    name: 'monotonic-clock'
  })

  assert.equal(timeRuntimeMethodNameFromPath(['Date', 'parse']), null)
  assert.equal(timeRuntimeCFunctionNameFromPath(['performance', 'mark']), null)
})
