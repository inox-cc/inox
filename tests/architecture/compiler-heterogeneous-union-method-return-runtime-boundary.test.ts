import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('heterogeneous method return validates every runtime alternative', () => {
  const result = compileSource(
    `
class Box {}
class Maker {
  make(value: boolean): Box | string[] {
    if (value) return new Box()
    return ['value']
  }
}
const result = new Maker().make(false)
`,
    { libraries: defaultCompilerLibrarySet, target: 'cc' }
  )

  assert.match(
    result.code,
    /inox_method_value_\d+\.tag == INOX_TAG_OBJECT \|\| inox_method_value_\d+\.tag == INOX_TAG_CLASS_INSTANCE/
  )
  assert.match(result.code, /inox_method_value_\d+\.tag == INOX_TAG_ARRAY/)
  assert.match(result.code, /inox_method_value_\d+\.as\.ref != 0/)
  assert.doesNotMatch(
    result.code,
    /if \(\(inox_method_value_\d+\.tag != INOX_TAG_OBJECT && inox_method_value_\d+\.tag != INOX_TAG_CLASS_INSTANCE\)/
  )
})
