import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { CompileError } from '../../compiler/diagnostics.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('Math random entropy capability зависит только от package option conditions', () => {
  assert.throws(
    () =>
      compileSource('Math.random()\n', {
        libraries: defaultCompilerLibrarySet,
        profile: 'embedded'
      }),
    capabilityError
  )

  compileSource('Math.random()\n', {
    libraries: defaultCompilerLibrarySet,
    libraryOptions: [{ optionId: 'global:math#random-seed', value: 7 }],
    profile: 'embedded'
  })
  compileSource('Math.random()\n', {
    libraries: defaultCompilerLibrarySet,
    libraryOptions: [{ optionId: 'global:math#random-backend', value: 'simple' }],
    profile: 'embedded'
  })

  assert.throws(
    () =>
      compileSource('Math.random()\n', {
        libraries: defaultCompilerLibrarySet,
        libraryOptions: [{ optionId: 'global:math#random-backend', value: 'os' }],
        profile: 'embedded'
      }),
    capabilityError
  )
})

function capabilityError(error: unknown): boolean {
  return error instanceof CompileError && error.diagnostics[0].code === 'INOX_CAPABILITY'
}
