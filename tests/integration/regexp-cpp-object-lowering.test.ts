import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { compileFileToCModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'

type GeneratedTextFile = {
  path: string
  code: string
}

export function assertRegExpLowersToCppObject(): void {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: `
const regexp = /stdlib/i
const trimmed = '  Inox stdlib  '.trim()
console.log(regexp.test(trimmed))
console.log(/Inox/.test(trimmed))
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

  assert.match(source, /RegExp regexp\("stdlib", REG_ICASE\);/)
  assert.match(source, /regexp\.test\(trimmed\)/)
  assert.match(source, /RegExp\("Inox", 0\)\.test\(trimmed\)/)
  assert.match(source, /console\.log\("%d", regexp\.test\(trimmed\)\);/)
  assert.doesNotMatch(source, /\(\(double\)\(regexp\.test/)
  assert.doesNotMatch(source, /inox_regexp_test/)
  assert.doesNotMatch(source, /inox_regexp_literal/)
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
  assertRegExpLowersToCppObject()
}
