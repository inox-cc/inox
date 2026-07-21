import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSourceToIr } from '../../compiler/core.ts'
import { CompileError } from '../../compiler/diagnostics.ts'
import { emptyCompilerLibrarySet } from '../../compiler/extensions/library-set.ts'

test('empty library set не знает global fetch и AbortController', () => {
  assertUnknownGlobal("fetch('http://127.0.0.1/')\n", 'unknown name fetch')
  assertUnknownGlobal('new AbortController()\n', 'unknown class AbortController')
})

function assertUnknownGlobal(source: string, message: string): void {
  assert.throws(
    () => compileSourceToIr(source, {
      libraries: emptyCompilerLibrarySet,
      libraryOptions: [{ optionId: 'global:platform#loop-backend', value: 'libuv' }]
    }),
    (error: unknown) =>
      error instanceof CompileError &&
      error.diagnostics[0].code === 'INOX_UNKNOWN_NAME' &&
      error.diagnostics[0].message === message
  )
}
