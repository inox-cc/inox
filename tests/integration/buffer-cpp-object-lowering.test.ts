import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { compileFileToCModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'

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
    sourceRoot: '/pkg'
  }) as GeneratedTextFile[]
  const source = generatedTextFile(files, 'src/index.cc').code

  assert.match(source, /Buffer::from\("inox"\)/)
  assert.match(source, /Buffer::alloc\(\(size_t\)\(2\)\)/)
  assert.match(source, /Buffer::isBuffer\(text\)/)
  assert.doesNotMatch(source, /Buffer::from\(inox::StringView\("inox", 4\)\)/)
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
}
