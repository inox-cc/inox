import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('node:http использует declarations-only JS-shaped Value facade без raw ABI и fs coupling', async () => {
  const header = await readFile('stdlib/node/http/include/inox/http.h', 'utf8')
  const implementation = await readFile('stdlib/node/http/src/http.cc', 'utf8')
  const native = `${header}\n${implementation}`

  assert.match(header, /#include "inox\/callback\.h"/)
  assert.match(header, /class HttpListenOptions[\s\S]*explicit HttpListenOptions\(const inox::Value&/)
  assert.match(header, /class HttpHeaders[\s\S]*explicit HttpHeaders\(const inox::Value&/)
  assert.match(header, /class HttpServer\s*:\s*public inox::Value/)
  assert.match(header, /class HttpRequest\s*:\s*public inox::Value/)
  assert.match(header, /class HttpResponse\s*:\s*public inox::Value/)
  assert.match(header, /HttpServer& listen\(const HttpListenOptions&[^)]*inox::Callback/)
  assert.match(header, /HttpServer& close\([^)]*inox::Callback/)
  assert.match(header, /HttpServer& on\([^)]*inox::Callback/)
  assert.match(header, /HttpResponse& writeHead\([^)]*const HttpHeaders&/)
  assert.match(header, /class HttpModule[\s\S]*HttpServer createServer\(inox::Callback/)
  assert.match(header, /extern const HttpModule http;/)

  assert.doesNotMatch(header, /\)\s*const\s*\{|\)\s*\{/)
  assert.doesNotMatch(header, /\bstruct\b|\bvoid\s*\*|\btypedef\b|\b[a-zA-Z_][\w:<>]*\s*\*/)
  assert.doesNotMatch(header, /\b(?:raw|create|onRequest|localPort|methodEquals|urlEquals|text|sendFsFile)\s*\(/)
  assert.doesNotMatch(native, /inox\/(?:fs|buffer)\.h|\bfs\.|\bBuffer\b/)
})
