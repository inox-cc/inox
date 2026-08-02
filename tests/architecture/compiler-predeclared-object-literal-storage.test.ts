import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('object literal повторно использует storage одноимённого значения из завершённой ветки', () => {
  const result = compileSource(
    `
function read(flag: boolean): number {
  if (flag) {
    const value = new Map<string, { count: number }>().get('missing')
    if (value) console.log(value.count)
  }

  const value = { count: 2 }
  return value.count
}

console.log(read(false))
`,
    { libraries: defaultCompilerLibrarySet, target: 'cc' }
  )

  assert.match(result.code, /inox::Value value;/)
  assert.match(result.code, /value = inox::ObjectValue::from\(/)
  assert.doesNotMatch(result.code, /auto value = inox::ObjectValue::from\(/)
})
