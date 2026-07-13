import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

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
await Promise.resolve('done')
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

  assert.match(source, /auto value = inox::await_value<inox::String>\(inox_promise_\d+\);/)
  assert.match(source, /if \(inox::thrown\(\)\) return;/)
  assert.match(source, /inox::await_value<inox::String>\(inox_promise_\d+\);/)
  assert.doesNotMatch(source, /auto inox_await_value_\d+ = inox::await_value<inox::String>\(inox_promise_\d+\);/)
  assert.doesNotMatch(source, /inox_promise_await/)
  assert.doesNotMatch(source, /inox_promise_state/)
  assert.doesNotMatch(source, /INOX_PROMISE_FULFILLED/)
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
  assert.match(source, /auto error = inox::take_exception\(\);/)
  assert.match(source, /inox_promise_rejected\(inox::loop\(\), inox::String\("bad", 3\), &inox_promise_\d+\)/)
  assert.doesNotMatch(source, /String::fromLiteral\(&inox_default_allocator/)
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assertPromiseAwaitUsesRuntimeHelper()
  assertPromiseAwaitCatchReadsRejectedValue()
}
