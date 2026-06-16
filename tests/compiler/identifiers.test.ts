import assert from 'node:assert/strict'
import test from 'node:test'

import { emitCIdentifier } from '../../src/compiler/c/identifiers.ts'

test('sanitizes C identifiers without regular expressions', () => {
  assert.equal(emitCIdentifier('module/file-name.ts'), 'module_file_name_ts')
  assert.equal(emitCIdentifier('Already_OK_123'), 'Already_OK_123')
  assert.equal(emitCIdentifier('space and unicode Ж'), 'space_and_unicode__')
})
