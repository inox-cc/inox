import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('native class field materialization uses the package-owned runtime value expression', () => {
  const result = compileSource(
    `
class Values {
  items: number[]

  constructor(items: number[]) {
    this.items = items
  }
}

console.log(new Values([1, 2]))
`,
    { libraries: defaultCompilerLibrarySet, target: 'cc' }
  )

  assert.match(result.code, /Array items;/)
  assert.match(result.code, /\*out = value\.items\.raw\(\);/)
  assert.match(result.code, /inox_retain\(\*out\);/)
  assert.doesNotMatch(result.code, /case 0:\n\s+\*out = inox_undefined_value\(\);/)
})
