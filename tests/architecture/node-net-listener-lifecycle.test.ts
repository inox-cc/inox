import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('node:net накапливает listeners и вызывает их по reentrant-safe snapshot', async () => {
  const source = await readFile('stdlib/node/net/src/net.cc', 'utf8')

  assert.match(source, /std::vector<inox::Callback>\s+connection_listeners_;/)
  assert.match(source, /std::vector<inox::Callback>\s+listening_listeners_;/)
  assert.match(source, /std::vector<inox::Callback>\s+data_listeners_;/)
  assert.match(source, /std::vector<inox::Callback>\s+close_listeners_;/)
  assert.match(source, /std::vector<inox::Callback>\s+error_listeners_;/)
  assert.match(source, /\.push_back\(std::move\(listener\)\)/)

  assert.match(source, /std::vector<inox::Callback>\s+listeners\s*=\s*[^;]+listeners_;/)
  assert.match(source, /for\s*\(const inox::Callback& listener : listeners\)/)
  assert.doesNotMatch(source, /inox::Callback\s+(?:connection|listening|data|close|error)_listener_;/)
})
