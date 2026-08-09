import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

test('node:zlib держит declarations-only facade и реализацию в одном cc', async () => {
  const header = await readFile('stdlib/node/zlib/include/inox/zlib.h', 'utf8')
  const source = await readFile('stdlib/node/zlib/src/zlib.cc', 'utf8')

  assert.match(header, /class ZlibModule/)
  assert.match(header, /Buffer gzipSync\(const inox::Value& data\) const;/)
  assert.doesNotMatch(header, /#include <zlib\.h>/)
  assert.doesNotMatch(header, /\{\s*(?:return|if|for|while)\b/s)
  assert.match(source, /deflateInit2\(/)
  assert.match(source, /inflateInit2\(/)
  assert.match(source, /Buffer ZlibModule::gunzipSync/)
})
