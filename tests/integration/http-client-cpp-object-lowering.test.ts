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

export async function assertHttpClientUsesCppObjectFacade(): Promise<void> {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: `
import http from 'node:http'

const request = http.request(
  {
    hostname: '127.0.0.1',
    port: 8080,
    path: '/resource',
    method: 'POST',
    headers: { 'X-Inox': 'yes' }
  },
  (response) => {
    response.setEncoding('utf8')
    response.on('data', (chunk) => console.log(chunk))
    response.on('end', () => {
      console.log(response.statusCode ?? 0, response.statusMessage ?? '')
    })
  }
)

request.setHeader('X-Extra', 'value')
request.hasHeader('x-extra')
request.getHeader('X-Extra')
request.getHeaderNames()
request.removeHeader('X-Extra')
request.on('finish', () => console.log('finished'))
request.write('body')
request.end()

http.get('http://127.0.0.1:8080/resource', (response) => {
  response.setEncoding('utf8')
  console.log(response.statusCode ?? 0)
})
`
      }
    ],
    { root: '/' }
  )
  const files = compileFileToCppModuleTextsSync('/pkg/src/index.ts', {
    callMain: true,
    host,
    libraries: defaultCompilerLibrarySet,
    libraryOptions: [{ optionId: 'target:runtime#loop-backend', value: 'libuv' }],
    sourceRoot: '/pkg'
  }) as GeneratedTextFile[]
  const source = generatedTextFile(files, 'src/index.cc').code

  assert.match(source, /http\.request\(HttpRequestOptions\(inox_object_\d+\), inox_callback_\d+\)/)
  assert.match(source, /HttpRequest response = /)
  assert.match(source, /response\.setEncoding\("utf8"\)/)
  assert.match(source, /response\.on\("data", inox_callback_\d+\)/)
  assert.match(source, /response\.on\("end", inox_callback_\d+\)/)
  assert.match(source, /HttpRequest\(response\)\.statusCode\(\)/)
  assert.match(source, /HttpRequest\(response\)\.statusMessage\(\)/)
  assert.match(source, /request\.setHeader\("X-Extra", "value"\)/)
  assert.match(source, /request\.hasHeader\("x-extra"\)/)
  assert.match(source, /request\.getHeader\("X-Extra"\)/)
  assert.match(source, /request\.getHeaderNames\(\)/)
  assert.match(source, /request\.removeHeader\("X-Extra"\)/)
  assert.match(source, /request\.on\("finish", inox_callback_\d+\)/)
  assert.match(source, /request\.write\("body"\)/)
  assert.match(source, /request\.end\(\)/)
  assert.match(source, /http\.get\("http:\/\/127\.0\.0\.1:8080\/resource", inox_callback_\d+\)/)
  assert.doesNotMatch(source, /inox::get\(response, "status(?:Code|Message)"\)/)

  await assertGeneratedCppCompiles(files, 'src/index.cc')
}

async function assertGeneratedCppCompiles(files: GeneratedTextFile[], source: string): Promise<void> {
  const directory = await createTestTempDir('http-client-cpp-object-lowering-')
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
    `HTTP client generated C++ compile failed\nsource: ${sourcePath}\nstdout: ${compile.stdout}\nstderr: ${compile.stderr}`
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
  await assertHttpClientUsesCppObjectFacade()
}
