import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('heterogeneous function union validates every runtime alternative', () => {
  const result = compileSource(
    `
class Box {}
function accept(value: Box | string[]): void { value }
accept(['value'])
`,
    { libraries: defaultCompilerLibrarySet, target: 'cc' }
  )

  assert.match(result.code, /value\.tag == INOX_TAG_CLASS_INSTANCE/)
  assert.match(result.code, /Array\(inox::Value\(value\)\)\.valid\(\)/)
  assert.doesNotMatch(
    result.code,
    /if \(\(value\.tag != INOX_TAG_OBJECT && value\.tag != INOX_TAG_CLASS_INSTANCE\) \|\| value\.as\.ref == 0\)/
  )
})
