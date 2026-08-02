import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

test('coroutine lowering не содержит ручной async state machine', () => {
  const coroutineSource = readFileSync(
    new URL('../../compiler/backends/cpp/async/coroutines.ts', import.meta.url),
    'utf8'
  )

  assert.match(coroutineSource, /createAsyncCallbackCoroutineWrapper/)
  assert.doesNotMatch(coroutineSource, /frame|resume|phase|state machine|inox_promise_/i)
})
