import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSourceToIr } from '../../compiler/core.ts'
import { CompileError } from '../../compiler/diagnostics.ts'
import { emptyCompilerLibrarySet } from '../../compiler/extensions/library-set.ts'

test('empty library set не знает global String и Number', () => {
  assertUnknownGlobal('String(7)\n', 'String')
  assertUnknownGlobal("Number('7')\n", 'Number')
})

function assertUnknownGlobal(source: string, name: string): void {
  assert.throws(
    () => compileSourceToIr(source, { libraries: emptyCompilerLibrarySet }),
    (error: unknown) =>
      error instanceof CompileError &&
      error.diagnostics[0].code === 'INOX_UNKNOWN_NAME' &&
      error.diagnostics[0].message === `unknown name ${name}`
  )
}
