import assert from 'node:assert/strict'
import test from 'node:test'

import { emitCIdentifier, escapeCString, utf8ByteLength } from '../../compiler/c/identifiers.ts'

test('sanitizes C identifiers without regular expressions', () => {
  assert.equal(emitCIdentifier('module/file-name.ts'), 'module_file_name_ts')
  assert.equal(emitCIdentifier('Already_OK_123'), 'Already_OK_123')
  assert.equal(emitCIdentifier('space and unicode Ж'), 'space_and_unicode__')
})

test('counts UTF-8 literal bytes without Buffer.byteLength', () => {
  assert.equal(utf8ByteLength('plain'), 5)
  assert.equal(utf8ByteLength('é'), 2)
  assert.equal(utf8ByteLength('Ж'), 2)
  assert.equal(utf8ByteLength('€'), 3)
  assert.equal(utf8ByteLength('😀'), 4)
  assert.equal(utf8ByteLength('\ud83d'), 3)
})

test('escapes C string format fragments without replaceAll chains', () => {
  assert.equal(escapeCString('plain'), 'plain')
  assert.equal(escapeCString('a\\\\b"c\\n\\r\\t'), 'a\\\\\\\\b\\"c\\\\n\\\\r\\\\t')
})
