import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('runtime exposes a non-allocating out-of-memory exception boundary', async () => {
  const header = await readFile('runtime/include/inox/loop.h', 'utf8')
  const source = await readFile('runtime/src/core/exception.cc', 'utf8')
  const cmake = await readFile('runtime/CMakeLists.txt', 'utf8')
  const featureRuntime = await readFile('tests/helpers/runtime-c.ts', 'utf8')

  assert.match(header, /void throw_out_of_memory\(\);/)
  assert.match(source, /throw_value\(inox_undefined_value\(\)\);/)
  assert.doesNotMatch(source, /String|alloc|new/)
  assert.match(cmake, /src\/core\/exception\.cc/)
  assert.match(featureRuntime, /runtime\/src\/core\/exception\.cc/)
})
