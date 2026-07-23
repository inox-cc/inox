import assert from 'node:assert/strict'
import test from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('Array.isArray emits a direct non-throwing C++ call', () => {
  const result = compileSource(
    `
function report(value: unknown): void {
  console.log(Array.isArray(value))
}
`,
    {
      libraries: defaultCompilerLibrarySet,
      target: 'cc'
    }
  )

  assert.match(result.code, /console\.log\("%d", Array::isArray\(inox::Value\(value\)\)\);/)
  assert.doesNotMatch(result.code, /inox_library_result_/)
  assert.doesNotMatch(result.code, /if \(inox::thrown\(\)\) return;/)
})
