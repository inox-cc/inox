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

export function assertNetUsesCppObjectFacade(): void {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: `
import net from 'node:net'

const server = net.createServer((socket) => {
  socket.end('ok')
})
server.listen(0, '127.0.0.1')
const address = server.address()
console.log(address.port)
server.close()
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

  assert.match(source, /NetServer server;/)
  assert.match(source, /server = NetServer::create\(inox::loop\(\), inox_net_connection_handler_\d+, 0\);\n  if \(inox::thrown\(\)\) return;/)
  assert.match(source, /server\.listen\("127\.0\.0\.1", \(int\)\(0\), \(int\)\(128\)\);\n  if \(inox::thrown\(\)\) return;/)
  assert.match(source, /NetAddress address = server\.address\(\);\n  if \(inox::thrown\(\)\) return;/)
  assert.match(source, /server\.close\(\);/)
  assert.match(source, /NetSocket\(inox_socket\)\.end\(inox::StringView\("ok", 2\)\);\n  if \(inox::thrown\(\)\) return INOX_ERR_TYPE;/)
  assert.doesNotMatch(source, /inox_net_server\* \w+ = 0;/)
  assert.doesNotMatch(source, /inox_net_socket\* \w+ = 0;/)
  assert.doesNotMatch(source, /inox_net_status_\d+/)
  assert.doesNotMatch(source, /NetServer\([a-zA-Z_][a-zA-Z0-9_]*\)\.listen/)
  assert.doesNotMatch(source, /NetSocket\([a-zA-Z_][a-zA-Z0-9_]*\)\.write/)
  assert.doesNotMatch(source, /\.address\(&/)
  assert.doesNotMatch(source, /\.bytesRead\(&/)

  const header = readFileSync(resolve('stdlib/node/net/include/inox/net.h'), 'utf8')
  assert.match(header, /inox::StringView family;/)
  assert.match(header, /typedef inox_status \(\*NetDataFn\)\(void\* user, inox_net_socket\* socket, inox::StringView bytes\);/)
  assert.match(header, /void listen\(inox::StringView host, int port, int backlog\) const;/)
  assert.match(header, /static NetSocket connect\([\s\S]*?inox_loop\* loop,[\s\S]*?inox::StringView host,/)
  assert.doesNotMatch(header, /const char\* family/)
  assert.doesNotMatch(header, /NetDataFn\)\(void\* user, inox_net_socket\* socket, const char\* bytes, size_t len\)/)
  assert.doesNotMatch(header, /listen\(const char\* host/)
  assert.doesNotMatch(header, /connect\([\s\S]*?inox_loop\* loop,[\s\S]*?const char\* host,/)
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
  assertNetUsesCppObjectFacade()
}
