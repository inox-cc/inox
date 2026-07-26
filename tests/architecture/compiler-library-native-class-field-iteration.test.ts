import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('native class field iteration keeps the native receiver', () => {
  const result = compileSource(
    `
class Values {
  items: number[]

  constructor(items: number[]) {
    this.items = items
  }

  sum(): number {
    let total = 0

    for (const item of this.items) {
      total = total + item
    }

    return total
  }
}

console.log(new Values([1, 2]).sum())
`,
    { libraries: defaultCompilerLibrarySet, target: 'cc' }
  )

  assert.match(result.code, /auto inox_library_iterator_\d+ = this->items\.values\(\);/)
  assert.doesNotMatch(result.code, /inox::get\(inox_this, "items"\)/)
})
