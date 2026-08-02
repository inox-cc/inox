import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('coroutine проверяет pending exception до приостановки', () => {
  const result = compileSource(
    `
function merge(left: { a: number }, right: { b: number }): { a: number; b: number } {
  return { ...left, ...right }
}

async function run() {
  merge({ a: 1 }, { b: 2 })
  await Promise.resolve(3)
}

await run()
`,
    { libraries: defaultCompilerLibrarySet, target: 'cc' }
  )

  const run = result.code.slice(result.code.indexOf('inox::Promise run()'))
  const mergeCall = run.indexOf('merge(')
  const suspension = run.indexOf('co_await', mergeCall)
  const barrier = run.indexOf('if (inox::thrown())', mergeCall)

  assert.notEqual(mergeCall, -1)
  assert.notEqual(suspension, -1)
  assert.notEqual(barrier, -1)
  assert.ok(barrier < suspension)
  assert.match(run, /\(void\)\(merge\(inox_object_\d+, inox_object_\d+\)\);/)
  assert.doesNotMatch(run, /auto inox_call_result_\d+ = merge/)
})
