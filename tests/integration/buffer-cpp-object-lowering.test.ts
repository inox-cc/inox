import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { compileFileToCModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

type GeneratedTextFile = {
  path: string
  code: string
}

export function assertBufferLowersToCppObject(): void {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: `
import { Buffer } from 'node:buffer'

const text = Buffer.from('inox')
const allocated = Buffer.alloc(2)
console.log(text.toString(), allocated.toString(), Buffer.isBuffer(text))
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
    sourceRoot: '/pkg'
  }) as GeneratedTextFile[]
  const source = generatedTextFile(files, 'src/index.cc').code

  assert.match(source, /Buffer::from\("inox"\)/)
  assert.match(source, /Buffer::alloc\(2(?:\.0)?\)/)
  assert.match(source, /Buffer::isBuffer\(text\)/)
  assert.doesNotMatch(source, /Buffer::from\(inox::StringView\("inox", 4\)\)/)
}

export function assertBufferNativeFacadeHidesAllocatorOverloads(): void {
  const binaryHeader = readFileSync(resolve('stdlib/global/binary/include/inox/binary.h'), 'utf8')
  const bufferHeader = readFileSync(resolve('stdlib/node/buffer/include/inox/buffer.h'), 'utf8')
  const binarySource = readFileSync(resolve('stdlib/global/binary/src/binary.cc'), 'utf8')
  const bufferSource = readFileSync(resolve('stdlib/node/buffer/src/buffer.cc'), 'utf8')
  const fsSource = readFileSync(resolve('stdlib/node/fs/src/fs.cc'), 'utf8')

  assert.doesNotMatch(binaryHeader, /BytesStorage/)
  assert.doesNotMatch(binaryHeader, /#ifdef __cplusplus/)
  assert.doesNotMatch(bufferHeader, /#ifdef __cplusplus/)
  assert.doesNotMatch(bufferHeader, /(?:Buffer\s+)?from\(inox_allocator/)
  assert.doesNotMatch(bufferHeader, /isBuffer\(inox_value value\)/)
  assert.doesNotMatch(binaryHeader, /Uint8Array\(inox_value/)
  assert.doesNotMatch(bufferHeader, /Buffer\(inox_value/)
  assert.doesNotMatch(binarySource, /Uint8Array Uint8Array::(?:create|from)\(inox_allocator/)
  assert.doesNotMatch(bufferSource, /Buffer Buffer::from\(inox_allocator/)
  assert.doesNotMatch(bufferSource, /Buffer::isBuffer\(inox_value value\)/)
  assert.doesNotMatch(binarySource, /Uint8Array::Uint8Array\(inox_value/)
  assert.doesNotMatch(binarySource, /Uint8Array\(inox::adopt_value/)
  assert.doesNotMatch(bufferSource, /Buffer::Buffer\(inox_value/)
  assert.doesNotMatch(bufferSource, /Buffer\(inox::adopt_value/)
  assert.doesNotMatch(fsSource, /Buffer\(inox::adopt_value/)
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
  assertBufferLowersToCppObject()
  assertBufferNativeFacadeHidesAllocatorOverloads()
}
