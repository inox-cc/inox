import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('scalar await преобразуется одной проверяемой runtime-операцией', () => {
  const result = compileSource(
    'async function value() { return 1 }\nasync function run() { console.log(await value()) }\nawait run()\n',
    { libraries: defaultCompilerLibrarySet, target: 'cc' }
  )

  assert.match(result.code, /auto inox_await_\d+ = inox::expect_number\(co_await value\(\)\);/)
  assert.match(result.code, /co_return inox::Value\(inox_number_value\(1\)\);/)
  assert.doesNotMatch(result.code, /double inox_return = 0;/)
  assert.doesNotMatch(result.code, /inox_await_\d+\.tag != INOX_TAG_NUMBER/)
  assert.doesNotMatch(result.code, /inox_await_\d+\.as\.number/)
})
