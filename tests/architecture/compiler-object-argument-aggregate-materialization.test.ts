import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('object literal в аргументе создаётся одной агрегатной операцией', () => {
  const result = compileSource(
    'function read(value: { count: number }): number { return value.count }\nconsole.log(read({ count: 2 }))\n',
    { libraries: defaultCompilerLibrarySet, target: 'cc' }
  )

  assert.match(
    result.code,
    /auto inox_object_\d+ = inox::ObjectValue::from\(&inox_object_shape_\d+, \{ inox_number_value\(2\) \}\);/
  )
  assert.doesNotMatch(result.code, /inox_object_\d+\.init\(/)
})
