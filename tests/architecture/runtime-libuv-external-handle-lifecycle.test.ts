import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('libuv backend управляет lifecycle внешних stdlib handles без package knowledge', async () => {
  const header = await readFile('runtime/src/async/loop-libuv-internal.h', 'utf8')
  const implementation = await readFile('runtime/src/async/loop-libuv.c', 'utf8')

  assert.match(header, /inox_libuv_loop_register_external_handle\(/)
  assert.match(header, /inox_libuv_loop_unregister_external_handle\(/)
  assert.match(implementation, /external_handle_head/)
  assert.match(implementation, /external->close\(external->context\)/)
  assert.doesNotMatch(header, /dgram|udp|socket/i)
  assert.doesNotMatch(implementation, /dgram|udp|socket/i)
})
