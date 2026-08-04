import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('node:dgram доставляет lifecycle events через сохранённые native listeners', async () => {
  const source = await readFile('stdlib/node/dgram/src/dgram.cc', 'utf8')

  assert.match(source, /std::vector<inox::Callback> listening_listeners_;/)
  assert.match(source, /std::vector<inox::Callback> connect_listeners_;/)
  assert.match(source, /std::vector<inox::Callback> error_listeners_;/)
  assert.match(source, /DgramSocket::Impl::bind\([^)]*\)[\s\S]*listening_listeners_[\s\S]*queueCallback/)
  assert.match(source, /DgramSocket::Impl::connect\([^)]*\)[\s\S]*connect_listeners_[\s\S]*queueCallback/)
  assert.match(source, /DgramSocket::Impl::emitError\([^)]*\)[\s\S]*error_listeners_/)
  assert.match(source, /hasText\(event_name, "close"\)[\s\S]*close_callbacks_/)
})
