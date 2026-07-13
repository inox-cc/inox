import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('node:net передаёт error listeners объект с readonly message', async () => {
  const source = await readFile('stdlib/node/net/src/net.cc', 'utf8')
  const tlsConsumers = await Promise.all([
    readFile('runtime/src/network/tls-boringssl.cc', 'utf8'),
    readFile('runtime/src/network/tls-openssl.cc', 'utf8')
  ])

  assert.match(source, /inox::Value\s+materializeNetError\([^)]*\)/)
  assert.match(source, /\{"message",\s*INOX_FIELD_READONLY\}/)
  assert.match(source, /ObjectValue::create\(&shape\)/)
  assert.match(
    source,
    /reportError\([^)]*\)\s*\{[\s\S]*materializeNetError\([^)]*\)[\s\S]*callListeners\([^;]*error\)/
  )
  assert.equal(source.match(/materializeNetError\(error_message\)/g)?.length, 2)

  for (const consumer of tlsConsumers) {
    assert.match(consumer, /inox_tls_on_tcp_error\([^)]*\)\s*\{[\s\S]*args\[0\]\.tag != INOX_TAG_OBJECT/)
  }
})
