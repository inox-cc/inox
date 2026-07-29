import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import {
  futureLibrarySet,
  futureRuntimeHeader,
  futureRuntimeRequirement
} from './helpers/compiler-future-library-fixtures.ts'

test('async-result lowering не зависит от исходных имён методов provider-а', () => {
  const result = compileSource(
    `
async function work() {
  const value = await Future.succeed(1).map((item) => item + 1)
  return value
}

const mapped = await Future.succeed(2).map((item) => item + 1)
const recovered = await Future.fail(new Error('failed')).recover((reason) => reason.message)
await work()
`,
    { libraries: futureLibrarySet(), target: 'cc' }
  )

  assert.ok(result.ir.runtimeRequirements.includes(futureRuntimeRequirement))
  assert.match(result.code, new RegExp(`#include "${futureRuntimeHeader.replace('.', '\\.')}"`))
  assert.match(result.code, /fixture::FutureTask::completed\(/)
  assert.match(result.code, /\.transformValue\(/)
  assert.match(result.code, /fixture::FutureTask::failed\(/)
  assert.match(result.code, /\.recoverFailure\(/)
  assert.match(result.code, /auto inox_value_\d+ = inox::get\(reason, "message"\);/)
  assert.doesNotMatch(result.code, /\.succeed\(/)
  assert.doesNotMatch(result.code, /\.fail\(/)
  assert.doesNotMatch(result.code, /\.map\(/)
  assert.doesNotMatch(result.code, /\.recover\(/)
})
