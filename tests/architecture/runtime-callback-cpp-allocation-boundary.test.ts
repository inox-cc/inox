import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('C++ Callback не выпускает std::bad_alloc через runtime boundary', async () => {
  const source = await readFile('runtime/src/core/callback_bridge.cc', 'utf8')

  assert.match(source, /catch \(const std::bad_alloc&\)/)
  assert.match(source, /TypeError: callback argument allocation failed/)
})
