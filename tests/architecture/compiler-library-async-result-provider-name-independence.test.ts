import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { promiseRuntimeRequirement } from '../../stdlib/global/promise/compiler/index.ts'
import { futureLibrarySet } from './helpers/compiler-future-library-fixtures.ts'

test('async-result lowering не зависит от исходных имён методов provider-а', () => {
  const result = compileSource(
    `
async function work(): Future<number> {
  const value = await Future.succeed(1).map((item) => item + 1)
  return value
}

const mapped = await Future.succeed(2).map((item) => item + 1)
const recovered = await Future.fail(new Error('failed')).recover((reason) => reason.message)
await work()
`,
    { libraries: futureLibrarySet(), target: 'cc' }
  )

  assert.ok(result.ir.runtimeRequirements.includes(promiseRuntimeRequirement))
  assert.match(result.code, /#include "inox\/promise\.h"/)
  assert.match(result.code, /inox::Promise::resolve\(/)
  assert.match(result.code, /\.then\(/)
  assert.match(result.code, /inox::Promise::reject\(/)
  assert.match(result.code, /\.catchError\(/)
  assert.match(result.code, /auto inox_value_\d+ = inox::get\(reason, "message"\);/)
  assert.doesNotMatch(result.code, /\.succeed\(/)
  assert.doesNotMatch(result.code, /\.fail\(/)
  assert.doesNotMatch(result.code, /\.map\(/)
  assert.doesNotMatch(result.code, /\.recover\(/)
})
