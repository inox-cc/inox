import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSourceToIr } from '../../compiler/compiler.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('lowering preserves declared type aliases on expressions', () => {
  const compiled = compileSourceToIr(`
type Item = { name: string }
function first(items: Item[]): Item | null { return items[0] }
`, { libraries: defaultCompilerLibrarySet })
  const returned = compiled.hir.body[1].body[0].argument

  assert.equal(returned.type, 'IndexExpression')
  assert.equal(returned.declaredType, 'Item')
})
