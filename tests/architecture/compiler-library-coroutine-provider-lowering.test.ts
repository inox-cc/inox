import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { futureLibrarySet } from './helpers/compiler-future-library-fixtures.ts'

test('async function становится coroutine выбранного provider-а', () => {
  const result = compileSource(
    `
async function work(): Future<number> {
  const value = await Future.succeed(1).map((item) => item + 1)
  return value
}

await work()
`,
    { libraries: futureLibrarySet('FixtureFuture'), target: 'cc' }
  )

  assert.match(result.code, /FixtureFuture work\(\)/)
  assert.match(result.code, /co_await FixtureFuture::bridgeAwait\(/)
  assert.match(result.code, /co_return inox::Value\(inox_number_value\(inox_return\)\)/)
  assert.doesNotMatch(result.code, /inox_async_task_/)
  assert.doesNotMatch(result.code, /FixtureFuture::bridgeWatch\(/)
  assert.doesNotMatch(result.code, /inox_promise_/)
})
