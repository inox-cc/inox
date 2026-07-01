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
  assert.match(main, /return 1;/)
  assert.match(main, /if \(inox_promise_\d+\.has_unhandled_rejection\(\)\) \{/)
}

export function assertModuleMainUsesRaiiReturns(): void {
  const source = compileModuleMainSource(`
const value = await Promise.resolve('ok')
console.log(value)
`)
  const main = mainFunctionSource(source)

  assert.doesNotMatch(main, /\ncleanup:/)
  assert.doesNotMatch(main, /goto cleanup;/)
  assert.match(main, /return 1;/)
  assert.match(main, /if \(inox_promise_\d+\.has_unhandled_rejection\(\)\) \{/)
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
}
