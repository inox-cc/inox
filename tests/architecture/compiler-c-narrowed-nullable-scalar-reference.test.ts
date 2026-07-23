import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'

test('narrowed nullable scalar relational expressions use the emitted C++ reference', () => {
  const result = compileSource(
    'function atLeast(index: number | null, limit: number): boolean {\n' +
      '  if (index === null) return false\n' +
      '  return index >= limit\n' +
      '}\n',
    { target: 'cc' }
  )

  assert.match(result.code, /inox_index\.as\.number >= limit/)
  assert.doesNotMatch(result.code, /\bindex\.as\.number/)
})
