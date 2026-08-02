import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('RAII function result повторно использует storage одноимённого значения из завершённой ветки', () => {
  const result = compileSource(
    `
function create(): { count: number } {
  return { count: 2 }
}

function read(flag: boolean): number {
  if (flag) {
    const value = new Map<string, { count: number }>().get('missing')
    if (value) console.log(value.count)
  }

  const value = create()
  return value.count
}

console.log(read(false))
`,
    { libraries: defaultCompilerLibrarySet, target: 'cc' }
  )

  assert.match(result.code, /inox::Value value;/)
  assert.match(result.code, /value = inox_call_result_\d+;/)
  assert.doesNotMatch(result.code, /inox::Value value = inox_call_result_\d+;/)
})
