import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { compileFileToCppModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

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
server.on('listening', () => console.log('listening'))
server.listen({ port: 0, host: '127.0.0.1', backlog: 16 })
const address = server.address()
console.log(address.address, address.family, address.port)
server.close(() => console.log('server closed'))

const client = net.createConnection(
  { port: address.port, host: '127.0.0.1' },
  () => console.log('connected')
)
client.setEncoding('utf8')
client.on('data', (chunk) => console.log(chunk.length))
client.on('close', (hadError) => console.log(hadError))
client.setNoDelay()
client.setKeepAlive(true, 10)
client.write('ping', () => console.log('written'))
client.end()
`
      }
    ],
    {
      root: '/'
    }
  )
  const files = compileFileToCppModuleTextsSync('/pkg/src/index.ts', {
    callMain: true,
    host,
    libraries: defaultCompilerLibrarySet,
    libraryOptions: [{ optionId: 'target:runtime#loop-backend', value: 'libuv' }],
    sourceRoot: '/pkg'
  }) as GeneratedTextFile[]
  const source = generatedTextFile(files, 'src/index.cc').code

  assert.match(source, /#include "inox\/net\.h"/)
  assert.match(
    source,
    /static inox_status inox_callback_arrow_\d+\(\s*void\* inox_context,\s*const inox_value\* args,\s*size_t arg_count,\s*inox_value\* inox_callback_out\s*\)/
  )
  assert.match(source, /args\[0\]\.tag != INOX_TAG_OBJECT && args\[0\]\.tag != INOX_TAG_CLASS_INSTANCE/)
  assert.match(source, /NetSocket socket = args\[0\];/)
  assert.match(source, /socket\.end\("ok"\)/)
  assert.match(source, /auto server = net\.createServer\(inox_callback_\d+\);/)
  assert.match(source, /server\.on\("listening", inox_callback_\d+\);/)
  assert.match(source, /server\.listen\(NetListenOptions\(/)
  assert.match(source, /auto address = server\.address\(\);/)
  assert.match(source, /address\.address/)
  assert.match(source, /address\.family/)
  assert.match(source, /address\.port/)
  assert.match(source, /server\.close\(inox_callback_\d+\);/)
  assert.match(source, /auto client = net\.connect\(NetConnectionOptions\(/)
  assert.match(source, /client\.on\("data", inox_callback_\d+\);/)
  assert.match(source, /args\[0\]\.tag != INOX_TAG_STRING/)
  assert.match(source, /inox_string\* chunk = \(inox_string\*\)args\[0\]\.as\.ref;/)
  assert.match(source, /client\.on\("close", inox_callback_\d+\);/)
  assert.match(source, /args\[0\]\.tag != INOX_TAG_BOOL/)
  assert.match(source, /client\.write\("ping", inox_callback_\d+\)/)
  assert.doesNotMatch(source, /inox_net_|Net(?:Connection|Data|Close|Socket|Server|Connect)Fn/)
  assert.doesNotMatch(source, /inox_net_(?:connection|socket|server)_handler_/)
  assert.doesNotMatch(source, /NetServer\(server\)\.|NetSocket\(client\)\./)
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
