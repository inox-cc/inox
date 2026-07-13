import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { compileFileToCModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

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

const echo = dgram.createSocket('udp4', (message, rinfo) => {
  return
})
echo.close()

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
    libraries: defaultCompilerLibrarySet,
    loopBackend: 'libuv',
    sourceRoot: '/pkg'
  }) as GeneratedTextFile[]
  const source = generatedTextFile(files, 'src/index.cc').code

  assert.match(source, /#include "inox\/dgram\.h"/)
  assert.match(source, /auto socket = dgram\.createSocket\("udp4"\);\n  if \(inox::thrown\(\)\) return;/)
  assert.match(source, /socket\.bind\(0, "127\.0\.0\.1"\);\n  if \(inox::thrown\(\)\) return;/)
  assert.match(source, /auto address = socket\.address\(\);\n  if \(inox::thrown\(\)\) return;/)
  assert.match(source, /console\.log\("%.17g", \(\(double\)address\.port\)\);/)
  assert.match(source, /socket\.setTTL\(16\);\n  if \(inox::thrown\(\)\) return;/)
  assert.match(source, /socket\.getSendBufferSize\(\);\n  if \(inox::thrown\(\)\) return;/)
  assert.match(source, /socket\.unref\(\);\n  if \(inox::thrown\(\)\) return;/)
  assert.match(source, /socket\.close\(\);\n  if \(inox::thrown\(\)\) return;/)
  assert.match(source, /connected\.connect\(1234, "127\.0\.0\.1"\);\n  if \(inox::thrown\(\)\) return;/)
  assert.match(source, /connected\.send\("ping"\);\n  if \(inox::thrown\(\)\) return;/)
  assert.match(
    source,
    /static inox_status inox_callback_arrow_\d+\(void\* inox_context, const inox_value\* args, size_t arg_count, inox_value\* out\)/
  )
  assert.match(source, /args\[0\]\.tag != INOX_TAG_BYTES/)
  assert.match(source, /inox_value message = args\[0\];/)
  assert.match(source, /inox_value rinfo = args\[1\];/)
  assert.match(source, /return INOX_OK;/)
  assert.match(source, /inox_callback_new\([^\n]+inox_callback_arrow_\d+/)
  assert.match(source, /dgram\.createSocket\("udp4", inox_callback_\d+\)/)
  assert.match(source, /dgram\.createSocket\("udp4"\)/)
  assert.match(source, /inox_library_object_\d+\.bind\(0, "127\.0\.0\.1"\)/)
  assert.doesNotMatch(source, /inox::get\(address, "port"\)/)
  assert.doesNotMatch(source, /DgramSocket::create/)
  assert.doesNotMatch(source, /inox_dgram_/)
  assert.doesNotMatch(source, /onMessage|recvStart|recvStop/)
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
