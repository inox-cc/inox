import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import { compilerLibrary } from './helpers/compiler-library-fixtures.ts'

test('compiler library set rejects dependency cycles', () => {
  assert.throws(
    () =>
      createCompilerLibrarySet([
        compilerLibrary('node:a', ['node:b']),
        compilerLibrary('node:b', ['node:a'])
      ]),
    /Compiler library dependency cycle: node:a, node:b/
  )
})
