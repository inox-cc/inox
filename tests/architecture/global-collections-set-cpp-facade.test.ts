import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

test('global Set использует opaque JS-shaped C++ facade', async () => {
  const header = await readFile('stdlib/global/collections/include/inox/set.h', 'utf8')
  const implementation = await readFile('stdlib/global/collections/src/collections.cc', 'utf8')

  assert.match(header, /class Set : public inox::Value/)
  assert.match(header, /static Set from\(const inox::Value& values\);/)
  assert.match(header, /Set add\(const inox::Value& value\) const;/)
  assert.match(header, /bool erase\(const inox::Value& value\) const;/)
  assert.match(header, /SetIterator values\(\) const;/)
  assert.match(header, /SetIterationResult next\(\);/)
  assert.doesNotMatch(header, /SetStorage|SetEntry|SetSlotState|SetSlotOccupied/)
  assert.doesNotMatch(header, /Set::create|deleteValue|\bdata\(\)/)

  assert.match(implementation, /struct SetStorage/)
  assert.match(implementation, /static SetStorage\* set_data\(const Set& value\)/)
  assert.match(implementation, /Set Set::from\(const inox::Value& values\)/)
  assert.match(implementation, /bool Set::erase\(const inox::Value& value\) const/)
  assert.match(implementation, /SetIterationResult SetIterator::next\(\)/)
})
