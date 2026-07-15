import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSourceToIr } from '../../compiler/core.ts'
import { CompileError } from '../../compiler/diagnostics.ts'
import { emptyCompilerLibrarySet } from '../../compiler/extensions/library-set.ts'

test('empty library set не знает global JSON', () => {
  assert.throws(
    () => compileSourceToIr('JSON.parse(\'{"value":1}\')\n', { libraries: emptyCompilerLibrarySet }),
    (error: unknown) =>
      error instanceof CompileError &&
      error.diagnostics[0].code === 'INOX_UNKNOWN_NAME' &&
      error.diagnostics[0].message === 'unknown name JSON'
  )
})
