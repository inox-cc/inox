import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('простой object literal создаётся одной агрегатной операцией', () => {
  const result = compileSource(
    "function create() { const value: { name: string; count?: number } = { name: 'inox' }; return value }\ncreate()\n",
    { libraries: defaultCompilerLibrarySet, target: 'cc' }
  )

  assert.match(
    result.code,
    /auto value = inox::ObjectValue::from\(&inox_shape_value_\d+, \{ inox::String\("inox", 4\), inox_undefined_value\(\) \}\);/
  )
  assert.doesNotMatch(result.code, /value\.init\(/)
})
