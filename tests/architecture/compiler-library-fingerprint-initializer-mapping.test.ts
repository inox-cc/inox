import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import { compilerLibraryFingerprintFixture } from '../helpers/compiler-library-fingerprint-fixture.ts'

test('library set fingerprint учитывает C++ mapping runtime initializer', () => {
  const original = createCompilerLibrarySet([compilerLibraryFingerprintFixture()])
  const changed = createCompilerLibrarySet([
    compilerLibraryFingerprintFixture({ fastExpression: 'FingerprintMode::FastV2' })
  ])

  assert.notEqual(original.fingerprint, changed.fingerprint)
})
