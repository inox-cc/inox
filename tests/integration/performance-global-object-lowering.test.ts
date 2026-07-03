import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { compileFileToCModuleTextsSync, compileSource } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'

type GeneratedTextFile = {
  path: string
  code: string
}

export function assertPerformanceLowersToGlobalObject(): void {
  const sourceText = `
const now = performance.now()
const value = await Promise.resolve(now)
console.log(value >= 0)
`

  const unitResult = compileSource(sourceText, {
    target: 'cc'
  })

  assertPerformanceObjectCalls(unitResult.code)

  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: sourceText
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

  assertPerformanceObjectCalls(source)
}

function assertPerformanceObjectCalls(source: string): void {
  assert.match(source, /performance\.now\(\)/)
  assert.doesNotMatch(source, /inox_performance_now\(\)/)
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
  assertPerformanceLowersToGlobalObject()
}
