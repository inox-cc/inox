import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

test('node:dns использует declarations-only C++ facade и асинхронные libuv lookup API', async () => {
  const header = await readFile('stdlib/node/dns/include/inox/dns.h', 'utf8')
  const source = await readFile('stdlib/node/dns/src/dns.cc', 'utf8')

  assert.match(header, /class DnsLookupOptions/)
  assert.match(header, /class DnsPromisesModule/)
  assert.match(header, /class DnsModule/)
  assert.doesNotMatch(header, /uv_getaddrinfo|uv_getaddrinfo_t|\{\s*(?:return|if|for|while)\b/s)
  assert.match(source, /uv_getaddrinfo\([^;]*dnsLookupCallback/s)
  assert.match(source, /uv_getnameinfo\([^;]*dnsLookupServiceCallback/s)
  assert.match(source, /uv_freeaddrinfo\(addresses\)/)
  assert.match(source, /callback\.call\(arguments\)/)
  assert.match(source, /promise\.fulfill\(/)
  assert.match(source, /promise\.rejectWith\(/)
  assert.match(source, /std::stable_partition\(/)
})
