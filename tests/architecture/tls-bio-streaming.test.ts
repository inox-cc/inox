import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

test('TLS transport потребляет TCP fragment по мере заполнения BIO', async () => {
  const sources = await Promise.all([
    readFile('runtime/src/network/tls-boringssl.cc', 'utf8'),
    readFile('runtime/src/network/tls-openssl.cc', 'utf8'),
    readFile('runtime/src/network/tls-server-openssl.cc', 'utf8')
  ])

  for (const source of sources) {
    const dataStart = Math.max(
      source.lastIndexOf('inox_status onTcpData('),
      source.lastIndexOf('static inox_status inox_tls_on_tcp_data(')
    )
    const errorStart = Math.max(
      source.lastIndexOf('inox_status onTcpError('),
      source.lastIndexOf('static inox_status inox_tls_on_tcp_error(')
    )
    const incoming = source.slice(dataStart, errorStart)

    assert.ok(dataStart >= 0 && errorStart > dataStart)
    assert.match(incoming, /while \(offset < bytes\.len\)/)
    assert.match(incoming, /BIO_write/)
    assert.match(incoming, /BIO_should_retry/)
    assert.match(incoming, /driveHandshake|inox_tls_drive_handshake/)
    assert.match(incoming, /drainPlaintext|inox_tls_drain_plaintext/)
    assert.doesNotMatch(source, /HttpRequest|HttpResponse|node:https/)
  }
})
