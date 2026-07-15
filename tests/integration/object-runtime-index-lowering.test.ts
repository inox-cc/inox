import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { compileFileToCModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

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
  const files = compileFileToCModuleTextsSync('/pkg/src/index.ts', {
    callMain: true,
    host,
    libraries: defaultCompilerLibrarySet,
    sourceRoot: '/pkg'
  }) as GeneratedTextFile[]
  const source = generatedTextFile(files, 'src/index.cc').code

  assert.match(
    source,
    /auto inox_object_value_\d+ = inox::object_value_at\(a, 0\);\n\s+if \(inox::thrown\(\)\) return;\n\s+console\.log\(inox_object_value_\d+\);/
  )
  assert.match(
    source,
    /auto inox_object_entry_\d+ = inox::object_entry_at\(a, 0\);\n\s+if \(inox::thrown\(\)\) return;\n\s+console\.log\(inox_object_entry_\d+\);/
  )
  assert.doesNotMatch(source, /if \(inox_object_entry_\d+\.tag != INOX_TAG_UNDEFINED/)
  assert.match(source, /ArrayStorage\* inox_for_array_\d+ = Array\.raw\(inox_value_\d+\);/)
  assert.match(
    source,
    /if \(inox_for_array_\d+ == nullptr\) \{\n\s+inox::throw_value\(inox::String\("TypeError: value is not iterable"\)\);\n\s+return;\n\s+\}/
  )
  assert.match(
    source,
    /for \(size_t inox_for_index_\d+ = 0; inox_for_index_\d+ < inox_for_array_\d+->length; \+\+inox_for_index_\d+\) \{\n\s+inox::Value a = inox_for_array_\d+->items\[inox_for_index_\d+\];/
  )
  assert.doesNotMatch(source, /if \(\(a\.tag != INOX_TAG_OBJECT && a\.tag != INOX_TAG_CLASS_INSTANCE\)/)
  assert.doesNotMatch(source, /if \(\(inox_for_value_\d+\.tag != INOX_TAG_OBJECT && inox_for_value_\d+\.tag != INOX_TAG_CLASS_INSTANCE\)/)
  assert.doesNotMatch(source, /inox_object_values\(&inox_default_allocator, a, &inox_object_values_\d+\)/)
  assert.doesNotMatch(source, /inox_object_entries\(&inox_default_allocator, a, &inox_object_entries_\d+\)/)
  assert.doesNotMatch(source, /inox_status inox_object_values_status_\d+/)
  assert.doesNotMatch(source, /inox_status inox_object_entries_status_\d+/)
  assert.doesNotMatch(source, /if \(inox_object_values_status_\d+ == INOX_ERR_FIELD\)/)
  assert.doesNotMatch(source, /if \(inox_object_entries_status_\d+ == INOX_ERR_FIELD\)/)
  assert.doesNotMatch(source, /inox_array_len\(inox_value_\d+, &inox_for_length_\d+\)/)
  assert.doesNotMatch(source, /inox_array_get\(inox_value_\d+, inox_for_index_\d+, &inox_for_value_\d+\)/)
  assert.doesNotMatch(source, /int main\(void\) \{\n\s+inox::Value inox_object_value_\d+;/)
  assert.doesNotMatch(source, /int main\(void\) \{\n\s+inox::Value inox_object_entry_\d+;/)
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
