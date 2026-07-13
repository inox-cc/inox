import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('node:net привязывает callbacks и владение к фактическим libuv completions', async () => {
  const source = await readFile('stdlib/node/net/src/net.cc', 'utf8')

  assert.match(source, /inox_loop_queue_immediate\(/)
  assert.match(source, /uv_write\([^;]+net_write_cb\)/)
  assert.match(source, /uv_shutdown\([^;]+net_shutdown_cb\)/)
  assert.match(source, /uv_close\([^;]+net_(?:server|socket)_close_cb\)/)
  assert.match(source, /void\s+net_write_cb\(uv_write_t\*[^)]*\)[\s\S]*callback\.call\(/)
  assert.match(source, /void\s+net_shutdown_cb\(uv_shutdown_t\*[^)]*\)[\s\S]*callback\.call\(/)
  assert.match(source, /void\s+net_(?:server|socket)_close_cb\(uv_handle_t\*[^)]*\)[\s\S]*close_listeners_/)
  assert.match(source, /inox_bool_value\(socket->had_error_\)/)
  assert.match(source, /callListeners\(socket->loop_,\s*close_listeners_,\s*had_error\)/)
  assert.match(source, /inox::String\s+(?:data|chunk)\s*\(/)
  assert.doesNotMatch(source, /inox::StringView\s+(?:data|chunk)\s*\([^)]*buffer/)
})
