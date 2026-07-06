import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { compileFileToCModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'

type GeneratedTextFile = {
  path: string
  code: string
}

export function assertHttpServerUsesCppObjectFacade(): void {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: `
import { createServer } from 'node:http'

const server = createServer()
server.listen(8080, '127.0.0.1')
server.close()

createServer().listen(8081, '127.0.0.1')

createServer((request, response) => {
  if (request.method === 'GET') {
    response.end(request.url)
    return
  }

  response.statusCode = 404
  response.end('missing')
}).listen(8082, '127.0.0.1')
`
      }
    ],
    {
      root: '/'
    }
  )
  const files = compileFileToCModuleTextsSync('/pkg/src/index.ts', {
    callMain: true,
    host,
    loopBackend: 'libuv',
    sourceRoot: '/pkg'
  }) as GeneratedTextFile[]
  const source = generatedTextFile(files, 'src/index.cc').code

  assert.match(source, /HttpServer server;/)
  assert.match(source, /server\.create\(0, 0\);\n  if \(inox::thrown\(\)\) return;/)
  assert.match(source, /server\.listen\("127\.0\.0\.1", \(int\)\(8080\), 128\);\n  if \(inox::thrown\(\)\) return;/)
  assert.match(source, /server\.close\(\);/)
  assert.match(source, /HttpServer inox_http_server_\d+;/)
  assert.match(source, /inox_http_server_\d+\.create\(0, 0\);\n  if \(inox::thrown\(\)\) return;/)
  assert.match(source, /inox_http_server_\d+\.listen\("127\.0\.0\.1", \(int\)\(8081\), 128\);\n  if \(inox::thrown\(\)\) return;/)
  assert.match(source, /static void inox_http_handler_\d+\(void\* user, HttpRequest inox_request, HttpResponse inox_response\)/)
  assert.match(source, /HttpRequest request = inox_request;/)
  assert.match(source, /HttpResponse response = inox_response;/)
  assert.match(source, /response\.end\(inox::StringView\(request\.raw\(\)->url\.bytes, request\.raw\(\)->url\.len\)\);\n\s+if \(inox::thrown\(\)\) return;/)
  assert.doesNotMatch(source, /inox_http_server\* inox_http_server_\d+ = 0;/)
  assert.doesNotMatch(source, /inox_http_status_\d+/)
  assert.doesNotMatch(source, /static inox_status inox_http_handler_\d+/)
  assert.doesNotMatch(source, /const HttpRequestData\* request = inox_request;/)
  assert.doesNotMatch(source, /inox_http_response\* response = inox_response;/)
  assert.doesNotMatch(source, /HttpResponse\(response\)\./)
  assert.doesNotMatch(source, /\.create\([^;]+ != INOX_OK/)
  assert.doesNotMatch(source, /\.listen\([^;]+ != INOX_OK/)

  const header = readFileSync(resolve('stdlib/node/http/include/inox/http.h'), 'utf8')
  assert.match(header, /void listen\(inox::StringView host, int port, int backlog\) const;/)
  assert.match(header, /inox::StringView method;/)
  assert.match(header, /inox::StringView url;/)
  assert.match(header, /inox::StringView body;/)
  assert.match(header, /inox::StringView name;/)
  assert.match(header, /inox::StringView value;/)
  assert.match(header, /typedef void \(\*HttpHandlerFn\)\(void\* user, HttpRequest request, HttpResponse response\);/)
  assert.doesNotMatch(header, /typedef inox_status \(\*HttpHandlerFn\)/)
  assert.doesNotMatch(header, /HttpHandlerFn\)\(\s*void\* user,\s*const HttpRequestData\* request,\s*inox_http_response\* response/)
  assert.doesNotMatch(header, /listen\(const char\* host/)
  assert.doesNotMatch(header, /\bmethod_len\b/)
  assert.doesNotMatch(header, /\burl_len\b/)
  assert.doesNotMatch(header, /\bbody_len\b/)
  assert.doesNotMatch(header, /\bname_len\b/)
  assert.doesNotMatch(header, /\bvalue_len\b/)
}

function generatedTextFile(files: GeneratedTextFile[], path: string): GeneratedTextFile {
  for (const file of files) {
    if (file.path === path) {
      return file
    }
  }

  assert.fail(`missing generated file ${path}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assertHttpServerUsesCppObjectFacade()
}
