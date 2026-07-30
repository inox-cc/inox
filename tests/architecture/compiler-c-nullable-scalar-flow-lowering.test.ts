import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'

test('flow-narrowed nullable scalars are unboxed without repeated guards', () => {
  const result = compileSource(
    'function numberValue(value: number): number { return value }\n' +
      'function stringValue(value: string): string { return value }\n' +
      'function useNumber(count: number | null): number {\n' +
      '  if (count === null) return 0\n' +
      '  return numberValue(count)\n' +
      '}\n' +
      'function useString(label: string | null): string {\n' +
      "  if (label === null) return ''\n" +
      "  let assigned = ''\n" +
      '  assigned = label\n' +
      '  return `${label}:${assigned}:${stringValue(label)}`\n' +
      '}\n',
    { target: 'cc' }
  )

  assert.equal(matches(result.code, /count\.tag != INOX_TAG_NUMBER/g), 1)
  assert.equal(matches(result.code, /label\.tag != INOX_TAG_STRING/g), 1)
  assert.match(result.code, /numberValue\(count\.as\.number\)/)
  assert.match(result.code, /assigned_value_\d+ = label;/)
  assert.match(result.code, /stringValue\(label\)/)
})

function matches(value: string, pattern: RegExp): number {
  return value.match(pattern)?.length ?? 0
}
