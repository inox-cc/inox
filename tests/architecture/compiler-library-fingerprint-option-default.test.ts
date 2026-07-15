import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import { compilerLibraryFingerprintFixture } from '../helpers/compiler-library-fingerprint-fixture.ts'

test('library set fingerprint учитывает default library option', () => {
  const safe = createCompilerLibrarySet([compilerLibraryFingerprintFixture()])
  const fast = createCompilerLibrarySet([compilerLibraryFingerprintFixture({ defaultValue: 'fast' })])

  assert.notEqual(safe.fingerprint, fast.fingerprint)
})
