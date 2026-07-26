import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

test('global Array использует opaque JS-shaped C++ facade', async () => {
  const header = await readFile('stdlib/global/collections/include/inox/array.h', 'utf8')
  const source = await readFile('stdlib/global/collections/src/collections.cc', 'utf8')

  assert.match(header, /class Array : public inox::Value/)
  assert.match(header, /static Array create\(size_t len\);/)
  assert.match(header, /static Array from\(inox::StringView value\);/)
  assert.match(header, /static bool isArray\(const inox::Value& value\);/)
  assert.match(header, /ArrayIterator begin\(\) const;/)
  assert.match(header, /ArrayIterator end\(\) const;/)
  assert.match(header, /inox::Value operator\*\(\) const;/)
  assert.doesNotMatch(header, /extern Array Array;/)
  assert.doesNotMatch(header, /struct ArrayStorage/)
  assert.doesNotMatch(header, /using ArrayClass/)
  assert.match(source, /Array Array::create\(size_t len\)/)
  assert.match(source, /ArrayIterator ArrayIterator::begin\(\) const/)
  assert.match(source, /ArrayIterator ArrayIterator::end\(\) const/)
  assert.match(
    source,
    /inox::Value Array::get\(size_t index\) const \{\s+if \(inox::thrown\(\)\) \{\s+return inox::Value\(\);/
  )
})
