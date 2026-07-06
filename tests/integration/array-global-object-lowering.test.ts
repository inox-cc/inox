import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { compileFileToCModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'

type GeneratedTextFile = {
  path: string
  code: string
}

export function assertArrayLowersToGlobalObject(): void {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: `
const foo = JSON.parse('{"v":[1]}')
const values = [1, 2, 3]
console.log(values.length)
console.log(Array.isArray(foo))
console.log(Array.isArray(1))
console.log(Array.isArray([1]))
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

  assert.match(source, /values = ArrayClass::create\(3\);/)
  assert.match(source, /ArrayClass\(values\)\.set\(0, inox_number_value\(1\)\);/)
  assert.match(source, /ArrayClass\(values\)\.set\(1, inox_number_value\(2\)\);/)
  assert.match(source, /ArrayClass\(values\)\.set\(2, inox_number_value\(3\)\);/)
  assert.match(source, /inox_array_\d+ = ArrayClass::create\(1\);/)
  assert.match(source, /ArrayClass\(inox_array_\d+\)\.set\(0, inox_number_value\(1\)\);/)
  assert.match(source, /console\.log\("%d", Array\.isArray\(foo\)\);/)
  assert.match(source, /console\.log\("%d", Array\.isArray\(inox_number_value\(1\)\)\);/)
  assert.match(source, /console\.log\("%d", Array\.isArray\(inox_array_\d+\)\);/)
  assert.doesNotMatch(source, /Array\.make\(&inox_default_allocator, 3, &values\)/)
  assert.doesNotMatch(source, /Array\.set\(values, 0, inox_number_value\(1\)\)/)
  assert.doesNotMatch(source, /foo\.tag == INOX_TAG_ARRAY/)
  assert.doesNotMatch(source, /inox_number_value\(1\)\.tag == INOX_TAG_ARRAY/)
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
  assertArrayLowersToGlobalObject()
}
