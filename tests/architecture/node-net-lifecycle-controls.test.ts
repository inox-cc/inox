import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('node:net хранит timeout и connection limits в native lifecycle', async () => {
  const declarations = await readFile('stdlib/node/net/index.d.ts', 'utf8')
  const descriptor = await readFile('stdlib/node/net/compiler/index.ts', 'utf8')
  const implementation = await readFile('stdlib/node/net/src/net.cc', 'utf8')

  assert.match(declarations, /maxConnections\?: number/)
  assert.match(declarations, /getConnections\(callback: \(error: Error \| null, count: number\) => void\): Server/)
  assert.match(declarations, /setTimeout\(timeout: number, callback\?: SocketCallback\): Socket/)
  assert.match(descriptor, /serverGetConnectionsOperation\(\)/)
  assert.match(descriptor, /serverMaxConnectionsWriteOperation\(\)/)
  assert.match(descriptor, /socketSetTimeoutOperation\(\)/)
  assert.match(implementation, /inox_loop_set_timeout\(/)
  assert.match(implementation, /server->connection_count_ \+= 1/)
  assert.match(implementation, /server->connectionClosed\(\)/)
  assert.match(implementation, /server->connection_count_ >= \*server->max_connections_/)
  assert.match(implementation, /if \(closed_ \|\| !handle_closed_ \|\| connection_count_ != 0\) return/)
})
