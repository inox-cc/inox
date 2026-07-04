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
  const appMain = appMainFunctionSource(result.code)
  const main = mainFunctionSource(result.code)

  assert.match(result.code, /#include "inox\/main\.h"/)
  assert.match(result.code, /static void inox_main\(void\)/)
  assert.doesNotMatch(appMain, /\ncleanup:/)
  assert.doesNotMatch(appMain, /goto cleanup;/)
  assert.doesNotMatch(appMain, /while \(inox_loop_has_work/)
  assert.doesNotMatch(result.code, /inox::RuntimeContext inox_runtime/)
  assert.doesNotMatch(result.code, /inox::Runtime inox_runtime;/)
  assert.doesNotMatch(result.code, /inox::RuntimeScope inox_runtime_scope/)
  assert.doesNotMatch(result.code, /inox_runtime\.init/)
  assert.doesNotMatch(result.code, /inox::loop\(\)->now_ms/)
  assert.doesNotMatch(result.code, /\.has_unhandled_rejection\(\)/)
  assert.doesNotMatch(result.code, /inox_promise_has_unhandled_rejection\(\)/)
  assert.doesNotMatch(appMain, /return INOX_OK;/)
  assert.doesNotMatch(appMain, /\n  \{\n/)
  assert.doesNotMatch(appMain, /\n  return;\n}/)
  assert.match(main, /return inox::main\(inox_main\);/)
}

export function assertModuleMainUsesRaiiReturns(): void {
  const source = compileModuleMainSource(`
const value = await Promise.resolve('ok')
console.log(value)
`)
  const appMain = appMainFunctionSource(source)
  const main = mainFunctionSource(source)

  assert.match(source, /#include "inox\/main\.h"/)
  assert.match(source, /static void inox_main\(void\)/)
  assert.doesNotMatch(appMain, /\ncleanup:/)
  assert.doesNotMatch(appMain, /goto cleanup;/)
  assert.doesNotMatch(appMain, /while \(inox_loop_has_work/)
  assert.doesNotMatch(source, /inox::RuntimeContext inox_runtime/)
  assert.doesNotMatch(source, /inox::Runtime inox_runtime;/)
  assert.doesNotMatch(source, /inox::RuntimeScope inox_runtime_scope/)
  assert.doesNotMatch(source, /inox_runtime\.init/)
  assert.doesNotMatch(source, /inox::loop\(\)->now_ms/)
  assert.doesNotMatch(source, /\.has_unhandled_rejection\(\)/)
  assert.doesNotMatch(source, /inox_promise_has_unhandled_rejection\(\)/)
  assert.doesNotMatch(appMain, /return INOX_OK;/)
  assert.doesNotMatch(appMain, /\n  \{\n/)
  assert.doesNotMatch(appMain, /\n  return;\n}/)
  assert.match(main, /return inox::main\(inox_main\);/)
}

export function assertProcessMainUsesReturnCodeHelper(): void {
  const source = compileModuleMainSource(`
const value = await Promise.resolve('ok')
console.log(process.version)
console.log(value)
`)
  const appMain = appMainFunctionSource(source)
  const main = mainFunctionSource(source)

  assert.match(source, /#include "inox\/process\.h"/)
  assert.match(appMain, /console\.log\("%\.\*s", process\.version\);/)
  assert.doesNotMatch(appMain, /inox_process_version\(/)
  assert.doesNotMatch(appMain, /inox_process_string/)
  assert.doesNotMatch(main, /return !inox_promise_has_unhandled_rejection/)
  assert.doesNotMatch(main, /return inox_process_get_exit_code\(\)/)
  assert.match(main, /return inox::main\(argc, argv, "src\/index\.ts", inox_main\);/)
}

export function assertGeneratedMainDoesNotCollideWithUserMain(): void {
  const result = compileSource(
    `
function main() {
  console.log(1)
}

main()
`,
    {
      target: 'cc'
    }
  )

  assert.match(result.code, /void inox_user_main\(void\)/)
  assert.match(result.code, /static void inox_main\(void\)/)
  assert.match(result.code, /inox_user_main\(\);/)
  assert.match(result.code, /return inox::main\(inox_main\);/)
  assert.doesNotMatch(result.code, /void inox_main\(void\) \{\n  console\.log/)
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
  assert.match(appMainFunctionSource(source), /checkFetch\(\);/)
  assert.match(main, /return inox::main\(inox_main\);/)
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

function appMainFunctionSource(source: string): string {
  return functionSource(source, 'static void inox_main(void) {')
}

function functionSource(source: string, signatureStart: string): string {
  const start = source.indexOf(signatureStart)

  assert.notEqual(start, -1, `missing generated function ${signatureStart}`)

  let nextFunction = source.indexOf('\n\nstatic void inox_main', start + signatureStart.length)

  if (nextFunction === -1) {
    nextFunction = source.indexOf('\n\nint main', start + signatureStart.length)
  }

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
  assertGeneratedMainDoesNotCollideWithUserMain()
  assertAwaitFunctionUsesExternalLoopRuntime()
  assertProcessMainUsesReturnCodeHelper()
}
