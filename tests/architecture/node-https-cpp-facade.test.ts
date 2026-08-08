import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

test('node:https — declarations-only facade над общим HTTP/TLS transport', async () => {
  const header = await readFile('stdlib/node/https/include/inox/https.h', 'utf8')
  const source = await readFile('stdlib/node/https/src/https.cc', 'utf8')
  const httpSource = await readFile('stdlib/node/http/src/http.cc', 'utf8')

  assert.match(header, /class HttpsRequestOptions/)
  assert.match(header, /class HttpsModule/)
  assert.match(header, /extern const HttpsModule https;/)
  assert.doesNotMatch(header, /\)\s*const\s*\{|\)\s*\{/)
  assert.doesNotMatch(header, /\bstruct\b|\bvoid\s*\*|\btypedef\b|\b[a-zA-Z_][\w:<>]*\s*\*/)

  assert.match(source, /createHttpClientRequest\(/)
  assert.match(source, /HttpClientTransportOptions::tls\(/)
  assert.doesNotMatch(source, /parseClientUrl|net\.connect|SSL_|HTTP\/1\.1/)
  assert.match(httpSource, /HttpClientTransportKind::tls/)
  assert.match(httpSource, /inox_tls_connect\(/)
})
