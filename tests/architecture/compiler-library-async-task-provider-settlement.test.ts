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
  assert.match(result.code, /FixtureFuture::taskValid\(FixtureFuture\(frame->promise\)\)/)
  assert.match(result.code, /FixtureFuture::taskValid\(FixtureFuture\(frame->awaited\)\)/)
  assert.doesNotMatch(result.code, /frame->(?:promise|awaited)\.valid\(\)/)
  assert.doesNotMatch(result.code, /inox_async_[A-Za-z0-9_]+\.valid\(\)/)
  assert.match(
    result.code,
    /FixtureFuture::taskObserve\([\s\S]{0,500}if \(status != INOX_OK\) \{[\s\S]{0,300}inox_async_task_work_finalize\(frame\);/
  )
  assert.match(result.code, /FixtureFuture::taskFulfill\(FixtureFuture\(frame->promise\),/)
  assert.match(result.code, /FixtureFuture::taskReject\(FixtureFuture\(frame->promise\),/)
  assert.doesNotMatch(result.code, /inox_promise_(?:resolve|reject)\(frame->promise/)
})
