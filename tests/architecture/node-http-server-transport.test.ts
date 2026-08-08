import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

test('HTTP и HTTPS server используют общую HTTP state machine через transport', async () => {
  const transport = await readFile('stdlib/node/http/include/inox/http_server_transport.h', 'utf8')
  const http = await readFile('stdlib/node/http/src/http.cc', 'utf8')
  const https = await readFile('stdlib/node/https/src/https.cc', 'utf8')
  const tls = await readFile('runtime/src/network/tls-server-openssl.cc', 'utf8')

  assert.match(transport, /class HttpServerConnectionTransport/)
  assert.match(transport, /HttpServer makeHttpServer\(/)
  assert.match(transport, /void acceptHttpServerConnection\(/)
  assert.doesNotMatch(transport, /\)\s*const\s*\{|\)\s*\{/)

  assert.match(http, /class NetHttpServerConnectionTransport/)
  assert.match(http, /std::shared_ptr<HttpServerConnectionTransport> transport_/)
  assert.match(https, /class HttpsServerConnectionTransport/)
  assert.match(https, /acceptHttpServerConnection\(/)
  assert.doesNotMatch(https, /HTTP\/1\.1|parseRequest|ParsedRequest/)

  assert.match(tls, /SSL_set_accept_state\(/)
  assert.doesNotMatch(tls, /HttpServer|HttpRequest|node:https/)
})
