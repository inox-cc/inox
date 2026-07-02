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
  const appMain = functionSource(source, 'static int inox_app_main(void) {')
  const main = functionSource(source, 'int main(void) {')

  assert.match(source, /#include "inox\/promise\.h"/)
  assert.match(source, /#include "inox\/main\.h"/)
  assert.match(source, /static int inox_app_main\(void\)/)
  assert.doesNotMatch(appMain, /inox::RuntimeContext inox_runtime/)
  assert.doesNotMatch(main, /inox::RuntimeContext inox_runtime/)
  assert.doesNotMatch(source, /inox::Runtime inox_runtime;/)
  assert.doesNotMatch(source, /inox::RuntimeScope inox_runtime_scope/)
  assert.doesNotMatch(source, /inox_runtime\.init/)
  assert.doesNotMatch(source, /inox::loop\(\)->now_ms/)
  assert.match(source, /inox::Promise promise;/)
  assert.doesNotMatch(source, /\.has_unhandled_rejection\(\)/)
  assert.doesNotMatch(source, /return !inox_promise_has_unhandled_rejection/)
  assert.match(source, /return inox::main\(inox_app_main\);/)
  assert.doesNotMatch(source, /int inox_loop_active = 0;/)
  assert.doesNotMatch(source, /inox_loop_dispose/)
  assert.doesNotMatch(source, /promise\.reset\(\);/)
  assert.doesNotMatch(source, /\n\s+inox_promise\* promise = 0;/)
  assert.doesNotMatch(source, /inox_promise_release\(promise\);/)
}

function functionSource(source: string, signatureStart: string): string {
  const start = source.indexOf(signatureStart)

  assert.notEqual(start, -1, `missing generated function ${signatureStart}`)

  const nextFunction = source.indexOf('\n\n', start + signatureStart.length)

  if (nextFunction === -1) {
    return source.slice(start)
  }

  return source.slice(start, nextFunction)
}

function generatedTextFile(files: GeneratedTextFile[], path: string): GeneratedTextFile {
  for (const file of files) {
    if (file.path === path) {
      return file
    }
  }

  assert.fail(`missing generated file ${path}`)
}
