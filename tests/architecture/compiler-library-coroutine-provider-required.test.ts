import assert from 'node:assert/strict'
import { test } from 'node:test'

import { futureLibrarySet, futureNativeTypeId } from './helpers/compiler-future-library-fixtures.ts'

test('async-result provider требует coroutine contract при создании library set', () => {
  assert.throws(
    () => futureLibrarySet('FixtureFuture', false),
    new RegExp(`intrinsic provider async-result native type ${futureNativeTypeId} requires cValidExpression`)
  )
})
