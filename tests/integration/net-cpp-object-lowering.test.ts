import assert from 'node:assert/strict'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { compileFileToCppModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { collectStdlibNativeIncludeArgs } from '../../scripts/lib/stdlib-native-files.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'
import { createTestTempDir, join, mkdir, rm, runCommand, writeFile } from '../helpers/runtime-c.ts'

type GeneratedTextFile = {
  path: string
  code: string
}

export async function assertNetUsesCppObjectFacade(): Promise<void> {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: `
import net, { connect, createConnection } from 'node:net'

const server = net.createServer((socket) => {
  socket.end('ok')
})
server.on('listening', () => console.log('listening'))
server.listen({ port: 0, host: '127.0.0.1', backlog: 16 })
server.ref().unref().ref()
console.log(server.listening)
const address = server.address()
console.log(address.address, address.family, address.port)
server.close(() => console.log('server closed'))

const client = net.createConnection(
  { port: address.port, host: '127.0.0.1' },
  () => console.log('connected')
)
client.setEncoding('utf8')
client.pause()
console.log(client.isPaused(), client.connecting, client.pending, client.readyState, client.destroyed)
client.resume()
client.on('data', (chunk) => console.log(chunk.length))
client.on('close', (hadError) => console.log(hadError))
client.setNoDelay()
client.setKeepAlive(true, 10)
client.write('ping', () => console.log('written'))
client.end()

net.connect(1).destroy()
net.connect(1, () => {}).destroy()
net.connect(1, '127.0.0.1').destroy()
net.connect(1, '127.0.0.1', () => {}).destroy()
net.connect({ port: 1 }).destroy()
net.connect({ port: 1, host: '127.0.0.1' }, () => {}).destroy()
net.createConnection(1).destroy()
net.createConnection({ port: 1 }, () => {}).destroy()
connect(1, '127.0.0.1').setNoDelay().destroy()
createConnection(1, () => {}).setKeepAlive().destroy()
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
    /static inox_status inox_callback_arrow_\d+\(\s*void\* inox_context,\s*const inox_value\* inox_callback_args,\s*size_t inox_callback_arg_count,\s*inox_value\* inox_callback_out\s*\)/
  )
  assert.match(
    source,
    /inox_callback_args\[0\]\.tag != INOX_TAG_OBJECT && inox_callback_args\[0\]\.tag != INOX_TAG_CLASS_INSTANCE/
  )
  assert.match(source, /NetSocket socket = NetSocket\(inox::Value\(inox_callback_args\[0\]\)\);/)
  assert.match(source, /socket\.end\("ok"\)/)
  assert.match(source, /auto server = net\.createServer\(inox_callback_\d+\);/)
  assert.match(source, /server\.on\("listening", inox_callback_\d+\);/)
  assert.match(source, /server\.listen\(NetListenOptions\(/)
  assert.match(source, /server\.ref\(\)/)
  assert.match(source, /\.unref\(\)/)
  assert.match(source, /inox::get\(server, "listening"\)|server\.listening\(\)/)
  assert.match(source, /auto address = server\.address\(\);/)
  assert.match(source, /address\.address/)
  assert.match(source, /address\.family/)
  assert.match(source, /address\.port/)
  assert.match(source, /server\.close\(inox_callback_\d+\);/)
  assert.match(source, /auto client = net\.connect\(NetConnectionOptions\(/)
  assert.match(source, /client\.on\("data", inox_callback_\d+\);/)
  assert.match(source, /client\.pause\(\)/)
  assert.match(source, /client\.isPaused\(\)/)
  assert.match(source, /inox::get\(client, "connecting"\)|client\.connecting\(\)/)
  assert.match(source, /inox::get\(client, "pending"\)|client\.pending\(\)/)
  assert.match(source, /inox::get\(client, "readyState"\)|client\.readyState\(\)/)
  assert.match(source, /inox::get\(client, "destroyed"\)|client\.destroyed\(\)/)
  assert.match(source, /client\.resume\(\)/)
  assert.match(source, /inox_callback_args\[0\]\.tag != INOX_TAG_STRING/)
  assert.match(source, /inox_string\* chunk = \(inox_string\*\)inox_callback_args\[0\]\.as\.ref;/)
  assert.match(source, /client\.on\("close", inox_callback_\d+\);/)
  assert.match(source, /inox_callback_args\[0\]\.tag != INOX_TAG_BOOL/)
  assert.match(source, /client\.write\("ping", inox_callback_\d+\)/)
  assert.match(source, /net\.connect\(1\)/)
  assert.match(source, /net\.connect\(1, inox_callback_\d+\)/)
  assert.match(source, /net\.connect\(1, "127\.0\.0\.1"\)/)
  assert.match(source, /net\.connect\(1, "127\.0\.0\.1", inox_callback_\d+\)/)
  assert.match(source, /net\.connect\(NetConnectionOptions\(/)
  assert.match(source, /\.setNoDelay\(\)/)
  assert.match(source, /\.setKeepAlive\(\)/)
  assert.doesNotMatch(source, /inox_net_|Net(?:Connection|Data|Close|Socket|Server|Connect)Fn/)
  assert.doesNotMatch(source, /inox_net_(?:connection|socket|server)_handler_/)
  assert.doesNotMatch(source, /NetServer\(server\)\.|NetSocket\(client\)\./)

  await assertGeneratedCppCompiles(files, 'src/index.cc')
}

async function assertGeneratedCppCompiles(files: GeneratedTextFile[], source: string): Promise<void> {
  const directory = await createTestTempDir('net-cpp-object-lowering-')
  const sourcePath = join(directory, source)

  for (const file of files) {
    const outputPath = join(directory, file.path)
    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(outputPath, file.code)
  }

  const compile = await runCommand('c++', [
    '-std=c++20',
    '-fsyntax-only',
    '-Iruntime/include',
    '-Iruntime/src/async',
    ...(await collectStdlibNativeIncludeArgs()),
    sourcePath
  ])

  if (compile.code === 0) {
    await rm(directory, { recursive: true, force: true })
  }

  assert.equal(
    compile.code,
    0,
    `net generated C++ compile failed\nsource: ${sourcePath}\nstdout: ${compile.stdout}\nstderr: ${compile.stderr}`
  )
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
  await assertNetUsesCppObjectFacade()
}
