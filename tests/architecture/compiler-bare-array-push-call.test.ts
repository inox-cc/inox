import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { CompileError } from '../../compiler/diagnostics.ts'
import { emptyCompilerLibrarySet } from '../../compiler/extensions/library-set.ts'

test('bare compiler не теряет вызов array push при генерации C++', () => {
  assert.throws(
    () =>
      compileSource('let values: number[]\nvalues.push(1)\n', {
        libraries: emptyCompilerLibrarySet,
        target: 'cc'
      }),
    (error: unknown) =>
      error instanceof CompileError &&
      error.diagnostics[0].code === 'INOX_UNKNOWN_FIELD' &&
      error.diagnostics[0].message === 'unknown field push'
  )
})
