import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('heterogeneous function return validates every runtime alternative', () => {
  const result = compileSource(
    `
type Box = { value: string }
function make(value: boolean): Box | string[] {
  if (value) return { value: 'box' }
  return ['value']
}
function read(): string {
  const result = make(false)
  if (Array.isArray(result)) return result[0] ?? ''
  return result.value
}
console.log(read())
`,
    { libraries: defaultCompilerLibrarySet, target: 'cc' }
  )

  assert.match(result.code, /inox::Value make\(double value\)/)
  assert.match(result.code, /inox::Value result = inox_call_result_\d+;/)
  assert.match(
    result.code,
    /\(result\.tag == INOX_TAG_OBJECT \|\| result\.tag == INOX_TAG_CLASS_INSTANCE\).*Array\(inox::Value\(result\)\)\.valid\(\)/s
  )
  assert.doesNotMatch(
    result.code,
    /if \(\(result\.tag != INOX_TAG_OBJECT && result\.tag != INOX_TAG_CLASS_INSTANCE\)/
  )
})
