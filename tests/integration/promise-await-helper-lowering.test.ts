import assert from 'node:assert/strict'

import { compileFileToCModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'

type GeneratedTextFile = {
  path: string
  code: string
}

export function assertPromiseAwaitUsesRuntimeHelper(): void {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: `
const value = await Promise.resolve('ok')
console.log(value)
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

  assert.match(
    source,
    /inox_promise_await\(inox::loop\(\), inox_promise_\d+, false, &inox_await_value_\d+, &inox_await_state_\d+\)/
  )
  assert.doesNotMatch(source, /while \(inox_promise_get_state/)
}

export function assertPromiseAwaitCatchReadsRejectedValue(): void {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: `
try {
  const value = await Promise.reject('bad')
  console.log(value)
} catch (error) {
  console.log(error)
}
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

  assert.match(source, /auto value = inox::await_value<inox::Value>\(inox_promise_\d+\);/)
  assert.match(
    source,
    /if \(inox::thrown\(\)\) goto catch_\d+;/
  )
  assert.match(source, /auto inox_error = inox::take_exception\(\);/)
  assert.doesNotMatch(source, /inox_error = inox_undefined_value\(\);\n\s+inox_error = inox_res_\d+\.error_value\(\);/)
  assert.doesNotMatch(source, /inox_await_result_\d+/)
  assert.doesNotMatch(source, /auto inox_res_\d+ = inox::await</)
  assert.doesNotMatch(source, /inox_res_\d+\.value\(\)/)
  assert.doesNotMatch(source, /inox_res_\d+\.ok\(\)/)
  assert.doesNotMatch(source, /inox_res_\d+\.error\(\)/)
  assert.doesNotMatch(source, /inox_res_\d+\.error_value\(\)/)
  assert.doesNotMatch(source, /inox_res_\d+\.status\(\)/)
  assert.doesNotMatch(source, /INOX_PROMISE_REJECTED/)
  assert.doesNotMatch(source, /while \(inox_promise_get_state/)
}

function generatedTextFile(files: GeneratedTextFile[], path: string): GeneratedTextFile {
  for (const file of files) {
    if (file.path === path) {
      return file
    }
  }

  assert.fail(`missing generated file ${path}`)
}
