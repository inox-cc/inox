import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

test('node:assert использует declarations-only C++ facade и единственный native source', async () => {
  const header = await readFile('stdlib/node/assert/include/inox/assert.h', 'utf8')
  const source = await readFile('stdlib/node/assert/src/assert.cc', 'utf8')

  assert.match(header, /class AssertModule/)
  assert.match(header, /void deepStrictEqual\(/)
  assert.match(header, /void throws\(/)
  assert.doesNotMatch(header, /class AssertionErrorValue|\{\s*(?:return|if|for|while)\b/s)
  assert.match(source, /class AssertionErrorValue : public Error/)
  assert.match(source, /class DeepComparator/)
  assert.match(source, /MapIterator iterator = map\.entries\(\)/)
  assert.match(source, /SetIterator iterator = set\.values\(\)/)
  assert.match(source, /block\.call\(\)/)
})
