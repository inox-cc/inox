import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

test('runtime callback имеет declarations-only C++ RAII facade', async () => {
  const header = await readFile('runtime/include/inox/callback.h', 'utf8')
  const implementation = await readFile('runtime/src/core/callback_bridge.cc', 'utf8')
  const cmake = await readFile('runtime/CMakeLists.txt', 'utf8')
  const testRuntime = await readFile('tests/helpers/runtime-c.ts', 'utf8')

  assert.match(header, /class Callback \{/)
  assert.match(header, /Callback\(inox_value value\);/)
  assert.match(header, /bool valid\(\) const;/)
  assert.match(header, /Value call\(\) const;/)
  assert.match(header, /Value call\(std::span<const Value> args\) const;/)
  assert.doesNotMatch(header, /Callback::\w+\([^;]*\)\s*\{/)
  assert.match(implementation, /Callback::call\(std::span<const Value> args\) const/)
  assert.match(cmake, /src\/core\/callback_bridge\.cc/)
  assert.match(testRuntime, /runtime\/src\/core\/callback_bridge\.cc/)
})
