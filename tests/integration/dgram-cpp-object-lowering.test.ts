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

export async function assertDgramSocketUsesCppObjectFacade(): Promise<void> {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: `
import dgram from 'node:dgram'

const socket = dgram.createSocket('udp4')
socket.on('listening', () => console.log('listening', socket.getSendQueueSize()))
socket.on('error', (error) => console.log(error.message))
socket.on('close', () => console.log('closed'))
socket.bind(0, '127.0.0.1')
const address = socket.address()
console.log(address.port)
socket.setTTL(16)
socket.setMulticastInterface('127.0.0.1')
socket.setMulticastLoopback(true)
socket.setMulticastTTL(4)
socket.addMembership('224.0.0.251', '127.0.0.1')
socket.dropMembership('224.0.0.251', '127.0.0.1')
const sendSize = socket.getSendBufferSize()
console.log(sendSize, socket.getSendQueueCount(), socket.getSendQueueSize())
socket.unref()
socket.close()

const connected = dgram.createSocket('udp4')
connected.connect(1234, '127.0.0.1')
connected.on('connect', () => console.log('connected'))
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
  const files = compileFileToCppModuleTextsSync('/pkg/src/index.ts', {
    callMain: true,
    host,
    libraries: defaultCompilerLibrarySet,
    libraryOptions: [{ optionId: 'target:runtime#loop-backend', value: 'libuv' }],
    sourceRoot: '/pkg'
  }) as GeneratedTextFile[]
  const source = generatedTextFile(files, 'src/index.cc').code

  assert.match(source, /#include "inox\/dgram\.h"/)
  assert.match(source, /(?:auto socket|auto inox_library_object_\d+) = dgram\.createSocket\("udp4"\);/)
  assert.match(source, /socket = inox_library_object_\d+;|auto socket =/)
  assert.match(source, /socket\.bind\(0, "127\.0\.0\.1"\);\n  if \(inox::thrown\(\)\) return;/)
  assert.match(source, /socket\.on\("listening", inox_callback_\d+\)/)
  assert.match(source, /socket\.on\("error", inox_callback_\d+\)/)
  assert.match(source, /socket\.on\("close", inox_callback_\d+\)/)
  assert.match(source, /auto address = socket\.address\(\);\n  if \(inox::thrown\(\)\) return;/)
  assert.match(source, /console\.log\("%.17g", static_cast<double>\(address\.port\)\);/)
  assert.match(source, /socket\.setTTL\(16\);\n  if \(inox::thrown\(\)\) return;/)
  assert.match(source, /socket\.setMulticastInterface\("127\.0\.0\.1"\)/)
  assert.match(source, /socket\.setMulticastLoopback\(true\)/)
  assert.match(source, /socket\.setMulticastTTL\(4\)/)
  assert.match(source, /socket\.addMembership\("224\.0\.0\.251", "127\.0\.0\.1"\)/)
  assert.match(source, /socket\.dropMembership\("224\.0\.0\.251", "127\.0\.0\.1"\)/)
  assert.match(source, /socket\.getSendBufferSize\(\);\n  if \(inox::thrown\(\)\) return;/)
  assert.match(source, /socket\.getSendQueueCount\(\)/)
  assert.match(source, /socket\.getSendQueueSize\(\)/)
  assert.match(source, /socket\.unref\(\);\n  if \(inox::thrown\(\)\) return;/)
  assert.match(source, /socket\.close\(\);\n  if \(inox::thrown\(\)\) return;/)
  assert.match(source, /connected\.connect\(1234, "127\.0\.0\.1"\);\n  if \(inox::thrown\(\)\) return;/)
  assert.match(source, /connected\.on\("connect", inox_callback_\d+\)/)
  assert.match(source, /connected\.send\("ping"\);\n  if \(inox::thrown\(\)\) return;/)
  assert.match(
    source,
    /static inox_status inox_callback_arrow_\d+\(\s*void\* inox_context,\s*const inox_value\* inox_callback_args,\s*size_t inox_callback_arg_count,\s*inox_value\* inox_callback_out\s*\)/
  )
  assert.match(source, /inox_callback_args\[0\]\.tag != INOX_TAG_BYTES/)
  assert.match(source, /Buffer message = Buffer\(inox_callback_args\[0\]\);/)
  assert.doesNotMatch(source, /inox_value message = inox_callback_args\[0\];/)
  assert.match(source, /inox_value rinfo = inox_callback_args\[1\];/)
  assert.match(source, /return INOX_OK;/)
  assert.match(source, /inox_callback_new\([^\n]+inox_callback_arrow_\d+/)
  assert.match(source, /dgram\.createSocket\("udp4", inox_callback_\d+\)/)
  assert.match(source, /dgram\.createSocket\("udp4"\)/)
  assert.match(source, /inox_library_object_\d+\.bind\(0, "127\.0\.0\.1"\)/)
  assert.doesNotMatch(source, /inox::get\(address, "port"\)/)
  assert.doesNotMatch(source, /DgramSocket::create/)
  assert.doesNotMatch(source, /inox_dgram_/)
  assert.doesNotMatch(source, /onMessage|recvStart|recvStop/)

  await assertGeneratedCppCompiles(files, 'src/index.cc')
}

async function assertGeneratedCppCompiles(files: GeneratedTextFile[], source: string): Promise<void> {
  const directory = await createTestTempDir('dgram-cpp-object-lowering-')
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
    `dgram generated C++ compile failed\nsource: ${sourcePath}\nstdout: ${compile.stdout}\nstderr: ${compile.stderr}`
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
  await assertDgramSocketUsesCppObjectFacade()
}
