import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSourceToIr } from '../../compiler/core.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('array container shape не включает object-only nominal assignment check', () => {
  const source = `
type Item = { path?: string[] }
function path(item: Item): string[] {
  if (item.path) return item.path
  return []
}
`

  const result = compileSourceToIr(source, { libraries: defaultCompilerLibrarySet })

  assert.equal(result.ir.functionDeclarations[0].returnType, 'object')
})
