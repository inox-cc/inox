import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import { compilerLibrary } from './helpers/compiler-library-fixtures.ts'

test('compiler library set rejects duplicate package ids', () => {
  assert.throws(
    () => createCompilerLibrarySet([compilerLibrary('global:a'), compilerLibrary('global:a')]),
    /Duplicate compiler library id global:a/
  )
})
