import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import { compilerLibrary } from './helpers/compiler-library-fixtures.ts'

test('compiler library set order and fingerprint are deterministic', () => {
  const base = compilerLibrary('global:base')
  const node = compilerLibrary('node:feature', ['global:base'])
  const forward = createCompilerLibrarySet([base, node])
  const reversed = createCompilerLibrarySet([node, base])

  assert.equal(forward.fingerprint, reversed.fingerprint)
  assert.deepEqual(forward.declarations, reversed.declarations)
  assert.deepEqual(forward.operations, reversed.operations)
})
