import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

test('node:http объявляет inactivity timeout как package-owned API', async () => {
  const declarations = await readFile('stdlib/node/http/index.d.ts', 'utf8')
  const descriptor = await readFile('stdlib/node/http/compiler/index.ts', 'utf8')
  const implementation = await readFile('stdlib/node/http/src/http.cc', 'utf8')

  assert.match(declarations, /readonly timeout\?: number/)
  assert.match(declarations, /setTimeout\(timeout: number, callback\?: MessageListener\): ClientRequest/)
  assert.match(declarations, /setTimeout\(milliseconds\?: number, callback\?: ServerTimeoutListener\): Server/)
  assert.match(descriptor, /clientSetTimeoutOperation\(\)/)
  assert.match(descriptor, /serverSetTimeoutOperation\(\)/)
  assert.match(implementation, /inox_loop_set_timeout\(/)
  assert.match(implementation, /if \(server_->timeout_listeners_\.empty\(\)\) \{\s+transport_->destroy\(\)/)
  assert.match(implementation, /if \(!closed_ && !destroyed_\) callHttpListeners\(timeout_listeners_\)/)
})
