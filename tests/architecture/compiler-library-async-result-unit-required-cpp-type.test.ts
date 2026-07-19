import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { futureLibrarySet } from './helpers/compiler-future-library-fixtures.ts'

test('unit emission использует только native type валидированного async-result provider', () => {
  const result = compileSource('const task = Future.succeed(1)\n', {
    libraries: futureLibrarySet('FixtureFuture'),
    target: 'cc'
  })

  assert.match(result.code, /FixtureFuture task/)
  assert.doesNotMatch(result.code, /\binox_promise/)
})
