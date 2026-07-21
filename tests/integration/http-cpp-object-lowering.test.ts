import assert from 'node:assert/strict'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { compileFileToCModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { collectStdlibNativeIncludeArgs } from '../../scripts/lib/stdlib-native-files.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'
import { createTestTempDir, join, mkdir, rm, runCommand, writeFile } from '../helpers/runtime-c.ts'

type GeneratedTextFile = {
  path: string
  code: string
}

export async function assertHttpServerUsesCppObjectFacade(): Promise<void> {
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
    libraries: defaultCompilerLibrarySet,
    libraryOptions: [{ optionId: 'global:platform#loop-backend', value: 'libuv' }],
    sourceRoot: '/pkg'
  }) as GeneratedTextFile[]
  const source = generatedTextFile(files, 'src/index.cc').code

  assert.match(source, /#include "inox\/http\.h"/)
  assert.match(source, /auto server = http\.createServer\(\);/)
  assert.match(source, /server\.listen\(8080, "127\.0\.0\.1"\)/)
  assert.match(source, /server\.close\(\)/)
  assert.match(source, /inox_library_object_\d+\.listen\(8081, "127\.0\.0\.1"\)/)
  assert.match(
    source,
    /static inox_status inox_callback_arrow_\d+\(void\* inox_context, const inox_value\* args, size_t arg_count, inox_value\* out\)/
  )
  assert.match(source, /arg_count < 2/)
  assert.match(source, /HttpRequest request = /)
  assert.match(source, /HttpResponse response = /)
  assert.match(source, /request\.url\(\)/)
  assert.match(source, /response\.end\(/)
  assert.match(source, /response\.setStatusCode\(404\)/)
  assert.match(source, /http\.createServer\(inox_callback_\d+\)/)
  assert.doesNotMatch(source, /inox_http_|inox_http_handler_|HttpHandlerFn/)
  assert.doesNotMatch(source, /sendFsFile|\.raw\(\)/)

  await assertGeneratedCppCompiles(files, 'src/index.cc')

  assert.doesNotMatch(source, /HttpRequest request = args\[0\];/)
  assert.doesNotMatch(source, /HttpResponse response = args\[1\];/)
}

async function assertGeneratedCppCompiles(files: GeneratedTextFile[], source: string): Promise<void> {
  const directory = await createTestTempDir('http-cpp-object-lowering-')
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
    `HTTP generated C++ compile failed\nsource: ${sourcePath}\nstdout: ${compile.stdout}\nstderr: ${compile.stderr}`
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
  await assertHttpServerUsesCppObjectFacade()
}
