import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('node:net использует JS-shaped RAII C++ facade без legacy wrappers', async () => {
  const header = await readFile('stdlib/node/net/include/inox/net.h', 'utf8')
  const implementation = await readFile('stdlib/node/net/src/net.cc', 'utf8')

  assert.match(header, /class NetListenOptions/)
  assert.match(header, /class NetConnectionOptions/)
  assert.match(header, /inox::String address;/)
  assert.match(header, /inox::String family;/)
  assert.match(header, /double port;/)
  assert.match(header, /class NetServer\s*:\s*public inox::Value/)
  assert.match(header, /NetServer& on\(inox::StringView event_name, inox::Callback listener\);/)
  assert.match(header, /class NetSocket\s*:\s*public inox::Value/)
  assert.match(header, /NetSocket& on\(inox::StringView event_name, inox::Callback listener\);/)
  assert.match(header, /class NetModule[\s\S]*NetServer createServer\(/)
  assert.match(header, /class NetModule[\s\S]*NetSocket connect\(/)
  assert.match(header, /extern const NetModule net;/)

  assert.doesNotMatch(header, /\binox_net_server\b|\binox_net_socket\b|\bvoid\s*\*/)
  assert.doesNotMatch(header, /typedef void \(\*Net|\bNetError\b|\braw\(\)/)
  assert.doesNotMatch(header, /\bonConnection\b|\bonData\b|\bsetCallbacks\b|\breadStart\b|\breadStop\b/)
  assert.doesNotMatch(header, /NetSocket& close\(/)
  assert.doesNotMatch(header, /static NetServer create\(|static NetSocket connect\(/)

  assert.match(implementation, /std::shared_ptr<NetServerState>/)
  assert.match(implementation, /std::shared_ptr<NetSocketState>/)
  assert.match(implementation, /inox_class_instance_ref_(?:new|copy)\(/)
  assert.match(implementation, /inox_libuv_loop_register_external_handle\(/)
  assert.match(implementation, /inox_libuv_loop_unregister_external_handle\(/)
})
