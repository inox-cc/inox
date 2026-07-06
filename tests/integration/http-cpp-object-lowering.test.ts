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
  assert.match(source, /server\.create\(inox::loop\(\), 0, 0\);\n  if \(inox::thrown\(\)\) return;/)
  assert.match(source, /server\.listen\("127\.0\.0\.1", \(int\)\(8080\), 128\);\n  if \(inox::thrown\(\)\) return;/)
  assert.match(source, /server\.close\(\);/)
  assert.match(source, /HttpServer inox_http_server_\d+;/)
  assert.match(source, /inox_http_server_\d+\.create\(inox::loop\(\), 0, 0\);\n  if \(inox::thrown\(\)\) return;/)
  assert.match(source, /inox_http_server_\d+\.listen\("127\.0\.0\.1", \(int\)\(8081\), 128\);\n  if \(inox::thrown\(\)\) return;/)
  assert.doesNotMatch(source, /inox_http_server\* inox_http_server_\d+ = 0;/)
  assert.doesNotMatch(source, /inox_http_status_\d+/)
  assert.doesNotMatch(source, /\.create\([^;]+ != INOX_OK/)
  assert.doesNotMatch(source, /\.listen\([^;]+ != INOX_OK/)

  const header = readFileSync(resolve('stdlib/node/http/include/inox/http.h'), 'utf8')
  assert.match(header, /void listen\(inox::StringView host, int port, int backlog\) const;/)
  assert.doesNotMatch(header, /listen\(const char\* host/)
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
