import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('optional array length uses the array runtime facade', () => {
  const result = compileSource(
    `
function size(values: number[] | null): number {
  return values?.length ?? 0
}
`,
    { libraries: defaultCompilerLibrarySet, target: 'cc' }
  )

  assert.match(result.code, /ArrayClass\(values\)\.length\(\)/)
  assert.doesNotMatch(result.code, /inox::get\(values, "length"\)/)
})
