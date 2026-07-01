import assert from 'node:assert/strict'

import { compileFileToCModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'

type GeneratedTextFile = {
  path: string
  code: string
}

export function assertPromiseVariablesUseCppRaii(): void {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: `
function run(): void {
  const promise = Promise.reject('bad')
  console.log('done')
}

run()
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

  assert.match(source, /#include "inox\/promise\.h"/)
  assert.match(source, /inox::Loop inox_loop;/)
  assert.match(source, /inox::Promise promise;/)
  assert.doesNotMatch(source, /\.has_unhandled_rejection\(\)/)
  assert.match(source, /return !inox_promise_has_unhandled_rejection\(\) \? 0 : 1;/)
  assert.doesNotMatch(source, /int inox_loop_active = 0;/)
  assert.doesNotMatch(source, /inox_loop_dispose/)
  assert.doesNotMatch(source, /promise\.reset\(\);/)
  assert.doesNotMatch(source, /\n\s+inox_promise\* promise = 0;/)
  assert.doesNotMatch(source, /inox_promise_release\(promise\);/)
}

function generatedTextFile(files: GeneratedTextFile[], path: string): GeneratedTextFile {
  for (const file of files) {
    if (file.path === path) {
      return file
    }
  }

  assert.fail(`missing generated file ${path}`)
}
