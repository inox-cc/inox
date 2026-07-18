import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { CompileError } from '../../compiler/diagnostics.ts'
import { emptyCompilerLibrarySet } from '../../compiler/extensions/library-set.ts'

test('empty library set не знает скрытый lowercase async-result type', () => {
  assertUnknownType('promise<number>')
  assertUnknownType('promise')
})

function assertUnknownType(typeName: string): void {
  assert.throws(
    () => compileSource(`let value: ${typeName}\n`, { libraries: emptyCompilerLibrarySet, target: 'cc' }),
    (error: unknown) =>
      error instanceof CompileError &&
      error.diagnostics[0].code === 'INOX_UNKNOWN_TYPE' &&
      error.diagnostics[0].message === `unknown type ${typeName}`
  )
}
