import assert from 'node:assert/strict'
import test from 'node:test'
import { parseFixtureMetadata, parseMetadataList, validateFixtureMetadata } from '../scripts/lib/fixture-metadata.ts'

test('parses fixture metadata header', () => {
  const result = parseFixtureMetadata(`// @targets c
// @features alloc,async
// @expect pass

console.log('ok')
`)

  assert.equal(result.metadata.get('targets'), 'c')
  assert.deepEqual(parseMetadataList(result.metadata.get('features') ?? ''), ['alloc', 'async'])
  assert.equal(result.metadata.get('expect'), 'pass')
  assert.equal(result.bodyStartLine, 5)
})

test('requires diagnostic code for diagnostic fixtures', () => {
  const result = validateFixtureMetadata(`// @expect diagnostic

var value = 1
`)

  assert.deepEqual(result.failures, ['diagnostic fixtures must include @diagnostic'])
})

test('accepts diagnostic fixtures with stable diagnostic code', () => {
  const result = validateFixtureMetadata(`// @expect diagnostic
// @diagnostic CCJS_NO_VAR

var value = 1
`)

  assert.deepEqual(result.failures, [])
})

test('accepts stdout metadata for pass fixtures', () => {
  const result = validateFixtureMetadata(`// @targets c
// @expect pass
// @stdout hello

console.log('hello')
`)

  assert.deepEqual(result.failures, [])
})
