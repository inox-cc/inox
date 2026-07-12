import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSourceToIr } from '../../compiler/core.ts'
import { emptyCompilerLibrarySet } from '../../compiler/extensions/library-set.ts'

test('source IR records the selected compiler library set fingerprint', () => {
  const compiled = compileSourceToIr('const answer = 40 + 2')

  assert.equal(compiled.ir.librarySetFingerprint, emptyCompilerLibrarySet.fingerprint)
  assert.equal(compiled.ir.version, 2)
})
