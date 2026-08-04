import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { compileFileToCppModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

type GeneratedTextFile = {
  path: string
  code: string
}

export function assertProcessRuntimeValueExpressionsUseConsoleObjects(): void {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: `
console.log(process.versions)
console.log(process)
const proc = process
const usage = process.memoryUsage()
console.log(proc.version, proc.versions.inox, proc.argv.length, usage.rss)
`
      }
    ],
    {
      root: '/'
    }
  )
  const files = compileFileToCppModuleTextsSync('/pkg/src/index.ts', {
    callMain: true,
    host,
    libraries: defaultCompilerLibrarySet,
    sourceRoot: '/pkg'
  }) as GeneratedTextFile[]
  const source = generatedTextFile(files, 'src/index.cc').code

  assert.match(source, /console\.log\(process\.versions\);/)
  assert.match(source, /console\.log\(process\);/)
  assert.match(source, /proc\.version/)
  assert.match(source, /proc\.versions\.inoxVersion/)
  assert.match(source, /proc\.argv\.length/)
  assert.match(source, /usage\.rss/)
  assert.doesNotMatch(source, /inox::get\(proc,/)
  assert.doesNotMatch(source, /inox::get\(usage,/)
  assert.doesNotMatch(source, /process\.versions\.value\(\);\n  if \(inox::thrown\(\)\) return/)
  assert.doesNotMatch(source, /process\.value\(\);\n  if \(inox::thrown\(\)\) return/)
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
  assertProcessRuntimeValueExpressionsUseConsoleObjects()
}
