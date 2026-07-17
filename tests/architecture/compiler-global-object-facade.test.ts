import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

test('global Object использует package-local declarations-only C++ facade', async () => {
  const header = await readFile('stdlib/global/object/include/inox/object_global.h', 'utf8')
  const source = await readFile('stdlib/global/object/src/object.cc', 'utf8')
  const runtimeHeader = await readFile('runtime/include/inox/object.h', 'utf8')

  assert.match(header, /class Object/)
  assert.match(header, /Array keys\(inox_value value\) const;/)
  assert.match(header, /Array values\(inox_value value\) const;/)
  assert.match(header, /Array entries\(inox_value value\) const;/)
  assert.match(header, /extern Object Object;/)
  assert.doesNotMatch(header, /\) const\s*\{/)
  assert.match(source, /Array Object::keys\(inox_value value\) const/)
  assert.match(source, /Array Object::values\(inox_value value\) const/)
  assert.match(source, /Array Object::entries\(inox_value value\) const/)
  assert.doesNotMatch(runtimeHeader, /class Object\s*\{/)
  assert.doesNotMatch(runtimeHeader, /extern Object Object;/)
})
