import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

test('coroutine lowering не знает concrete async-result runtime', () => {
  const source = readFileSync('compiler/backends/cpp/async/coroutines.ts', 'utf8')

  assert.doesNotMatch(source, /Promise|inox_promise_|observe|fulfill|rejectWith/)
})
