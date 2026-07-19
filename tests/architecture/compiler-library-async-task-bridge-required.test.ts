import assert from 'node:assert/strict'
import { test } from 'node:test'

import { futureLibrarySet } from './helpers/compiler-future-library-fixtures.ts'

test('async-result provider требует async-task bridge при создании library set', () => {
  assert.throws(
    () => futureLibrarySet('FixtureFuture', false),
    /intrinsic provider async-result native type global:promise#Promise requires an async-task bridge/
  )
})
