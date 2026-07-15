import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

test('global Map использует opaque JS-shaped C++ facade', async () => {
  const header = await readFile('stdlib/global/collections/include/inox/map.h', 'utf8')
  const implementation = await readFile('stdlib/global/collections/src/collections.cc', 'utf8')

  assert.match(header, /class Map : public inox::Value/)
  assert.match(header, /static Map from\(const inox::Value& values\);/)
  assert.match(header, /Map set\(const inox::Value& key, const inox::Value& value\) const;/)
  assert.match(header, /bool erase\(const inox::Value& key\) const;/)
  assert.match(header, /MapIterator entries\(\) const;/)
  assert.match(header, /MapIterator keys\(\) const;/)
  assert.match(header, /MapIterator values\(\) const;/)
  assert.match(header, /MapIterationResult next\(\);/)
  assert.doesNotMatch(header, /MapStorage|MapEntry|MapSlotState|MapSlotOccupied/)
  assert.doesNotMatch(header, /Map::create|deleteKey|\bdata\(\)/)

  assert.match(implementation, /struct MapStorage/)
  assert.match(implementation, /static MapStorage\* map_data\(const Map& value\)/)
  assert.match(implementation, /Map Map::from\(const inox::Value& values\)/)
  assert.match(implementation, /bool Map::erase\(const inox::Value& key\) const/)
  assert.match(implementation, /MapIterationResult MapIterator::next\(\)/)
})
