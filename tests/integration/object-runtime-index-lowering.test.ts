import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { compileFileToCModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibraryLiteralTypeInference, defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

type GeneratedTextFile = {
  path: string
  code: string
}

export function assertObjectRuntimeIndexUsesDirectHelpers(): void {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: `
const foo = JSON.parse('{"v":[{"1":2},{"3":4,"5":"text"}]}')

for (const a of foo.v) {
  console.log(Object.values(a)[0])
  console.log(Object.entries(a)[0])
}
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

  assert.match(source, /auto inox_library_object_\d+ = Object\.values\(inox::Value\(a\)\);/)
  assert.match(source, /auto inox_library_object_\d+ = Object\.entries\(inox::Value\(a\)\);/)
  assert.equal(source.match(/auto inox_library_(?:result|object)_\d+ = inox_library_object_\d+\.get\(0\);/g)?.length, 2)
  assert.match(source, /auto inox_library_iterator_\d+ = \(Array\(inox_value_\d+\)\)\.values\(\);/)
  assert.match(source, /while \(true\) \{/)
  assert.match(source, /auto inox_library_step_\d+ = inox_library_iterator_\d+\.next\(\);/)
  assert.match(source, /if \(inox_library_step_\d+\.done\) break;/)
  assert.doesNotMatch(source, /ArrayStorage|->items|Array\.raw/)
  assert.doesNotMatch(source, /inox::object_(?:value|entry)_at/)
  assert.doesNotMatch(source, /Array\(inox_(?:values|entries)_\d+\)\.get\(0\)/)
  assert.match(
    source,
    /if \(\(inox_library_value_\d+\.tag != INOX_TAG_OBJECT && inox_library_value_\d+\.tag != INOX_TAG_CLASS_INSTANCE\)/
  )
  assert.doesNotMatch(source, /inox_object_values\(&inox_default_allocator, a, &inox_object_values_\d+\)/)
  assert.doesNotMatch(source, /inox_object_entries\(&inox_default_allocator, a, &inox_object_entries_\d+\)/)
  assert.doesNotMatch(source, /inox_status inox_object_values_status_\d+/)
  assert.doesNotMatch(source, /inox_status inox_object_entries_status_\d+/)
  assert.doesNotMatch(source, /if \(inox_object_values_status_\d+ == INOX_ERR_FIELD\)/)
  assert.doesNotMatch(source, /if \(inox_object_entries_status_\d+ == INOX_ERR_FIELD\)/)
  assert.doesNotMatch(source, /inox_array_len\(inox_value_\d+, &inox_for_length_\d+\)/)
  assert.doesNotMatch(source, /inox_array_get\(inox_value_\d+, inox_for_index_\d+, &inox_for_value_\d+\)/)
  assert.doesNotMatch(source, /int main\(\) \{\n\s+inox::Value inox_object_value_\d+;/)
  assert.doesNotMatch(source, /int main\(\) \{\n\s+inox::Value inox_object_entry_\d+;/)
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
  assertObjectRuntimeIndexUsesDirectHelpers()
}
