import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { compileFileToCModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibraryLiteralTypeInference, defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

type GeneratedTextFile = {
  path: string
  code: string
}

export function assertObjectLowersToGlobalObject(): void {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: `
const foo = JSON.parse('{"v":{"a":1,"b":2}}')
console.log(Object.entries(foo.v))
console.log(Object.values(foo.v))
console.log(Object.keys(foo.v))
`
      }
    ],
    {
      root: '/'
    }
  )
  const files = compileFileToCModuleTextsSync(
    '/pkg/src/index.ts',
    {
      callMain: true,
      host,
      libraries: defaultCompilerLibrarySet,
      sourceRoot: '/pkg'
    },
    defaultCompilerLibraryLiteralTypeInference
  ) as GeneratedTextFile[]
  const source = generatedTextFile(files, 'src/index.cc').code

  assert.match(
    source,
    /console\.log\(Object\.entries\(inox::get\(foo, "v"\)\)\);\n  if \(inox::thrown\(\)\) return;/
  )
  assert.match(
    source,
    /console\.log\(Object\.values\(inox::get\(foo, "v"\)\)\);\n  if \(inox::thrown\(\)\) return;/
  )
  assert.match(
    source,
    /console\.log\(Object\.keys\(inox::get\(foo, "v"\)\)\);\n  if \(inox::thrown\(\)\) return;/
  )
  assert.doesNotMatch(source, /auto inox_(?:entries|values|keys)_\d+ = Object\./)
  assert.doesNotMatch(source, /inox::object_get\(foo, "v", 1, inox_value_\d+\)/)
  assert.doesNotMatch(source, /inox_value_\d+\.tag != INOX_TAG_ARRAY/)
  assert.doesNotMatch(source, /inox::object_entries\(.*inox_entries_\d+\)/)
  assert.doesNotMatch(source, /inox::object_values\(.*inox_values_\d+\)/)
  assert.doesNotMatch(source, /inox::object_keys\(.*inox_keys_\d+\)/)
  assert.doesNotMatch(source, /inox_object_entries\(&inox_default_allocator/)
  assert.doesNotMatch(source, /inox_object_values\(&inox_default_allocator/)
  assert.doesNotMatch(source, /inox_object_keys\(&inox_default_allocator/)
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
  assertObjectLowersToGlobalObject()
}
