import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { compileFileToCppModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { createCompilerLibrarySetFromDiscovered } from '../../scripts/lib/compiler-library-registry.ts'

const defaultCompilerLibrarySet = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries())

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
  const files = compileFileToCppModuleTextsSync('/pkg/src/index.ts', {
    callMain: true,
    host,
    libraries: defaultCompilerLibrarySet,
    sourceRoot: '/pkg'
  }) as GeneratedTextFile[]
  const source = generatedTextFile(files, 'src/index.cc').code

  assert.match(source, /#include "inox\/regexp\.h"/)
  assert.match(source, /auto regexp = RegExp\("stdlib", "i"\);/)
  assert.match(source, /regexp\.test\(trimmed\)/)
  assert.match(source, /auto inox_library_object_\d+ = RegExp\("Inox", ""\);/)
  assert.match(source, /inox_library_object_\d+\.test\(trimmed\)/)
  assert.match(source, /console\.log\("%d", regexp\.test\(trimmed\)\);/)
  assert.doesNotMatch(source, /\(\(double\)\(regexp\.test/)
  assert.doesNotMatch(source, /inox_regexp_test/)
  assert.doesNotMatch(source, /inox_regexp_literal/)
  assert.doesNotMatch(source, /REG_ICASE/)
  assert.doesNotMatch(source, /RegExpFlags/)
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
