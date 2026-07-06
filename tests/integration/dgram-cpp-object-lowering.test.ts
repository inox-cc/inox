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

export function assertDgramSocketUsesCppObjectFacade(): void {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: `
import dgram from 'node:dgram'

const socket = dgram.createSocket('udp4')
socket.bind(0, '127.0.0.1')
const address = socket.address()
console.log(address.port)
socket.setTTL(16)
const sendSize = socket.getSendBufferSize()
console.log(sendSize)
socket.unref()
socket.close()

const connected = dgram.createSocket('udp4')
connected.connect(1234, '127.0.0.1')
connected.send('ping')
connected.close()

dgram.createSocket('udp4').bind(0, '127.0.0.1')
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

  assert.match(source, /DgramSocket socket;/)
  assert.match(source, /socket = DgramSocket::create\(inox::loop\(\), 0, 0\);\n  if \(inox::thrown\(\)\) return;/)
  assert.match(source, /socket\.bind\("127\.0\.0\.1", \(int\)\(0\), 0\);\n  if \(inox::thrown\(\)\) return;/)
  assert.match(source, /DgramAddress address = socket\.address\(\);\n  if \(inox::thrown\(\)\) return;/)
  assert.match(source, /socket\.setTTL\(\(int\)\(16\)\);\n  if \(inox::thrown\(\)\) return;/)
  assert.match(source, /double sendSize = \(double\)socket\.getSendBufferSize\(\);\n  if \(inox::thrown\(\)\) return;/)
  assert.match(source, /socket\.unref\(\);\n  if \(inox::thrown\(\)\) return;/)
  assert.match(source, /socket\.close\(\);/)
  assert.match(source, /connected\.connect\("127\.0\.0\.1", \(int\)\(1234\)\);\n  if \(inox::thrown\(\)\) return;/)
  assert.match(source, /connected\.send\(inox::StringView\("ping", 4\)\);\n  if \(inox::thrown\(\)\) return;/)
  assert.match(source, /DgramSocket inox_dgram_socket_\d+;/)
  assert.match(source, /inox_dgram_socket_\d+ = DgramSocket::create\(inox::loop\(\), 0, 0\);/)
  assert.match(source, /inox_dgram_socket_\d+\.bind\("127\.0\.0\.1", \(int\)\(0\), 0\);/)
  assert.doesNotMatch(source, /inox_dgram_socket\* \w+ = 0;/)
  assert.doesNotMatch(source, /inox_dgram_status_\d+/)
  assert.doesNotMatch(source, /DgramSocket\(socket\)/)
  assert.doesNotMatch(source, /getSendBufferSize\(&/)
  assert.doesNotMatch(source, /address\(&/)

  const header = readFileSync(resolve('stdlib/node/dgram/include/inox/dgram.h'), 'utf8')
  assert.match(header, /inox::StringView family;/)
  assert.match(header, /inox::StringView bytes,/)
  assert.match(header, /inox::StringView host,/)
  assert.match(header, /void bind\(inox::StringView host, int port, unsigned int flags = 0\) const;/)
  assert.match(header, /void connect\(inox::StringView host, int port\) const;/)
  assert.match(header, /void send\(inox::StringView bytes\) const;/)
  assert.match(header, /void send\(inox::StringView bytes, inox::StringView host, int port\) const;/)
  assert.doesNotMatch(header, /const char\* bytes/)
  assert.doesNotMatch(header, /const char\* family/)
  assert.doesNotMatch(header, /\bsize_t len/)
  assert.doesNotMatch(header, /const char\* host/)
  assert.doesNotMatch(header, /bind\(const char\* host/)
  assert.doesNotMatch(header, /connect\(const char\* host/)
  assert.doesNotMatch(header, /send\(inox::StringView bytes, const char\* host/)
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
  assertDgramSocketUsesCppObjectFacade()
}
