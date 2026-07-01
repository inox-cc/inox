import assert from 'node:assert/strict'

import { compileFileToCModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'

type GeneratedTextFile = {
  path: string
  code: string
}

export function assertCatchOnlyDoesNotEmitErrorActiveState(): void {
  const source = compileSource(`
try {
  throw 'bad'
} catch (error) {
  console.log(error)
}
`)

  assert.match(source, /inox::Value inox_error;/)
  assert.doesNotMatch(source, /int inox_error_active = 0;/)
  assert.doesNotMatch(source, /inox_error_active = 1;/)
  assert.doesNotMatch(source, /inox_error_active = 0;/)
  assert.doesNotMatch(source, /inox_retain\(inox_error\);/)
  assert.doesNotMatch(source, /inox_release\(inox_error\);/)
}

export function assertAwaitCatchOnlyDoesNotEmitErrorActiveState(): void {
  const source = compileSource(`
try {
  await Promise.reject('bad')
} catch (error) {
  console.log(error)
}
`)

  assert.match(
    source,
    /inox_promise_await\(inox_loop\.raw\(\), inox_promise_\d+, true, &inox_await_value_\d+, &inox_await_state_\d+\)/
  )
  assert.doesNotMatch(source, /int inox_error_active = 0;/)
  assert.doesNotMatch(source, /inox_error_active = 1;/)
  assert.doesNotMatch(source, /inox_error_active = 0;/)
}

export function assertFinallyStillEmitsErrorActiveState(): void {
  const source = compileSource(`
try {
  throw 'bad'
} finally {
  console.log('done')
}
`)

  assert.match(source, /int inox_error_active = 0;/)
  assert.match(source, /inox_error_active = 1;/)
  assert.match(source, /if \(inox_error_active\) \{\n\s+return 1;\n\s+\}/)
}

function compileSource(source: string): string {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source
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

  return generatedTextFile(files, 'src/index.cc').code
}

function generatedTextFile(files: GeneratedTextFile[], path: string): GeneratedTextFile {
  for (const file of files) {
    if (file.path === path) {
      return file
    }
  }

  assert.fail(`missing generated file ${path}`)
}
