import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import { compilerLibraryFingerprintFixture } from '../helpers/compiler-library-fingerprint-fixture.ts'

test('library set fingerprint учитывает conditional capability', () => {
  const entropy = createCompilerLibrarySet([compilerLibraryFingerprintFixture()])
  const clock = createCompilerLibrarySet([compilerLibraryFingerprintFixture({ conditionalCapability: 'clock' })])

  assert.notEqual(entropy.fingerprint, clock.fingerprint)
})
