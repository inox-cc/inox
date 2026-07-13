import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const consumers = [
  'stdlib/global/fetch/src/fetch.cc',
  'stdlib/node/http/src/http.cc',
  'runtime/src/network/tls-boringssl.cc',
  'runtime/src/network/tls-openssl.cc'
]

test('внутренние consumers используют facade node:net без legacy ABI', async () => {
  const sources = await Promise.all(consumers.map((file) => readFile(file, 'utf8')))
  const source = sources.join('\n')

  assert.doesNotMatch(source, /\binox_net_(?:server|socket)\b|\bNetError\b/)
  assert.doesNotMatch(source, /NetSocket::connect|NetServer::create/)
  assert.doesNotMatch(source, /\.readStart\(\)|\.setCallbacks\(/)

  assert.match(source, /\bnet\.connect\(/)
  assert.match(source, /\.on\("data",/)
  assert.match(source, /\.destroy\(\)/)
})
