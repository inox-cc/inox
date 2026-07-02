import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { compileFileToCModuleTextsSync, compileSource } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'

type GeneratedTextFile = {
  path: string
  code: string
}

export function assertUnitMainUsesRaiiReturns(): void {
  const result = compileSource(
    `
const value = await Promise.resolve('ok')
console.log(value)
`,
    {
      target: 'cc'
    }
  )
  const main = mainFunctionSource(result.code)

  assert.doesNotMatch(main, /\ncleanup:/)
  assert.doesNotMatch(main, /goto cleanup;/)
  assert.doesNotMatch(main, /while \(inox_loop_has_work/)
  assert.match(main, /inox::Runtime inox_runtime;/)
  assert.match(main, /inox::RuntimeScope inox_runtime_scope\(inox_runtime\);/)
  assert.match(main, /inox::run\(\)/)
  assert.match(main, /return 1;/)
  assert.doesNotMatch(main, /\.has_unhandled_rejection\(\)/)
  assert.match(main, /return !inox_promise_has_unhandled_rejection\(\) \? 0 : 1;/)
}

export function assertModuleMainUsesRaiiReturns(): void {
  const source = compileModuleMainSource(`
const value = await Promise.resolve('ok')
console.log(value)
`)
  const main = mainFunctionSource(source)

  assert.doesNotMatch(main, /\ncleanup:/)
  assert.doesNotMatch(main, /goto cleanup;/)
  assert.doesNotMatch(main, /while \(inox_loop_has_work/)
  assert.match(main, /inox::Runtime inox_runtime;/)
  assert.match(main, /inox::RuntimeScope inox_runtime_scope\(inox_runtime\);/)
  assert.match(main, /inox::run\(\)/)
  assert.match(main, /return 1;/)
  assert.doesNotMatch(main, /\.has_unhandled_rejection\(\)/)
  assert.match(main, /return !inox_promise_has_unhandled_rejection\(\) \? 0 : 1;/)
}

export function assertAwaitFunctionUsesExternalLoopRuntime(): void {
  const source = compileModuleMainSource(`
async function checkFetch() {
  try {
    const value = await Promise.resolve('ok')
    console.log(value)
  } catch (error) {
    console.log(error)
  }
}

await checkFetch()
`)
  const checkFetch = functionSource(source, 'static void checkFetch(void) {')
  const main = mainFunctionSource(source)

  assert.match(source, /static void checkFetch\(void\)/)
  assert.doesNotMatch(checkFetch, /inox::Loop/)
  assert.doesNotMatch(checkFetch, /while \(inox_loop_has_work/)
  assert.doesNotMatch(checkFetch, /\ncleanup:/)
  assert.doesNotMatch(checkFetch, /inox_loop/)
  assert.doesNotMatch(source, /\.has_unhandled_rejection\(\)/)
  assert.match(main, /checkFetch\(\);/)
  assert.match(main, /inox::run\(\)/)
}

function compileModuleMainSource(source: string): string {
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

function mainFunctionSource(source: string): string {
  const start = source.indexOf('int main(')

  assert.notEqual(start, -1, 'missing generated main')

  return source.slice(start)
}

function functionSource(source: string, signatureStart: string): string {
  const start = source.indexOf(signatureStart)

  assert.notEqual(start, -1, `missing generated function ${signatureStart}`)

  const nextFunction = source.indexOf('\n\nint main', start + signatureStart.length)

  assert.notEqual(nextFunction, -1, `missing generated function end ${signatureStart}`)

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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assertUnitMainUsesRaiiReturns()
  assertModuleMainUsesRaiiReturns()
  assertAwaitFunctionUsesExternalLoopRuntime()
}
