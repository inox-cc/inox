import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('node:dgram использует JS-shaped RAII C++ facade без legacy wrappers', async () => {
  const header = await readFile('stdlib/node/dgram/include/inox/dgram.h', 'utf8')
  const implementation = await readFile('stdlib/node/dgram/src/dgram.cc', 'utf8')

  assert.match(header, /class DgramSocketOptions/)
  assert.match(header, /class DgramBindOptions/)
  assert.match(header, /inox::String address;/)
  assert.match(header, /struct DgramRemoteInfo : DgramAddress/)
  assert.match(header, /class DgramSocket[\s\S]*class Impl;[\s\S]*std::shared_ptr<Impl> impl_;/)
  assert.match(header, /DgramSocket& on\(inox::StringView event_name, inox::Callback listener\);/)
  assert.match(header, /class DgramModule[\s\S]*DgramSocket createSocket\(/)
  assert.match(header, /extern const DgramModule dgram;/)

  assert.doesNotMatch(header, /\binox_dgram_socket\b|\bvoid\s*\*|DgramRecvFn|DgramCloseFn/)
  assert.doesNotMatch(header, /\bonMessage\b|\bonClose\b|\brecvStart\b|\brecvStop\b|\blocalPort\b/)
  assert.doesNotMatch(header, /static DgramSocket create\(|INOX_DGRAM_BIND_REUSEADDR/)

  assert.match(implementation, /class DgramSocket::Impl/)
  assert.match(implementation, /uv_udp_send_cb/)
  assert.match(implementation, /uv_close\([^;]+dgram_close_cb\)/)
  assert.match(implementation, /inox_loop_queue_immediate\(/)
})
