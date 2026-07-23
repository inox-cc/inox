import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSourceToIr } from '../../compiler/core.ts'

test('неэкспортируемый @inline код может зависеть от private module binding', () => {
  assert.doesNotThrow(() =>
    compileSourceToIr(`
const hidden = 1
/** @inline */
function read(): number {
  return hidden
}
`)
  )
})
