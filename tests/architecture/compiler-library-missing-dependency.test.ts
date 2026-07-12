import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import { compilerLibrary } from './helpers/compiler-library-fixtures.ts'

test('compiler library set rejects a missing dependency', () => {
  assert.throws(
    () => createCompilerLibrarySet([compilerLibrary('node:a', ['global:missing'])]),
    /Missing compiler library dependency node:a -> global:missing/
  )
})
