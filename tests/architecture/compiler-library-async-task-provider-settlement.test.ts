import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { futureLibrarySet } from './helpers/compiler-future-library-fixtures.ts'

test('async task settle-ит основной result только через bridge выбранного provider-а', () => {
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

  assert.match(result.code, /static inox_status inox_async_task_work_start/)
  assert.match(result.code, /inox_async_task_work_start\(inox_loop\* inox_loop, FixtureFuture& out\)/)
  assert.doesNotMatch(result.code, /inox_async_task_work_start\([^\n]*&inox_promise_/)
  assert.match(result.code, /FixtureFuture::bridgeReady\(frame->asyncResult\)/)
  assert.match(result.code, /FixtureFuture::bridgeReady\(frame->awaited\)/)
  assert.doesNotMatch(result.code, /frame->(?:asyncResult|awaited)\.valid\(\)/)
  assert.doesNotMatch(result.code, /inox_async_[A-Za-z0-9_]+\.valid\(\)/)
  assert.match(
    result.code,
    /FixtureFuture::bridgeWatch\([\s\S]{0,500}if \(status != INOX_OK\) \{[\s\S]{0,300}inox_async_task_work_finalize\(frame\);/
  )
  assert.match(result.code, /FixtureFuture::bridgeComplete\(frame->asyncResult,/)
  assert.match(result.code, /FixtureFuture::bridgeAbort\(frame->asyncResult,/)
  assert.doesNotMatch(result.code, /inox_promise_(?:resolve|reject)\(frame->asyncResult/)
})
