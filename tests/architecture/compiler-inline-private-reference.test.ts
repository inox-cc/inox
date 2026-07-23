import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSourceToIr } from '../../compiler/core.ts'
import { CompileError } from '../../compiler/diagnostics.ts'

test('экспортируемый @inline код не может зависеть от private module binding', () => {
  assert.throws(
    () =>
      compileSourceToIr(`
const hidden = 1
/** @inline */
export function read(): number {
  return hidden
}
`),
    (error: unknown) =>
      error instanceof CompileError &&
      error.diagnostics[0].code === 'INOX_INLINE_PRIVATE_REFERENCE'
  )
})
