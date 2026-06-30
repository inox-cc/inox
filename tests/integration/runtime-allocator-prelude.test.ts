import assert from 'node:assert/strict'

import { compileFileToCModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'

type GeneratedTextFile = {
  path: string
  code: string
}

export function assertRuntimeAllocatorStaysInRuntime(): void {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: `
const value = 'hello'
const label: string = \`value \${value}\`
console.log(label)
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

  assert.match(source, /#include "inox\/allocator\.h"/)
  assert.doesNotMatch(source, /static void\* inox_default_alloc/)
  assert.doesNotMatch(source, /static void\* inox_default_realloc/)
  assert.doesNotMatch(source, /static void inox_default_free/)
  assert.doesNotMatch(source, /static inox_allocator inox_default_allocator/)
}

function generatedTextFile(files: GeneratedTextFile[], path: string): GeneratedTextFile {
  for (const file of files) {
    if (file.path === path) {
      return file
    }
  }

  assert.fail(`missing generated file ${path}`)
}
