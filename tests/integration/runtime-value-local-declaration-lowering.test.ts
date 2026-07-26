import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { compileFileToCppModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibraryLiteralTypeInference, defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

type GeneratedTextFile = {
  path: string
  code: string
}

export function assertRuntimeValueDeclarationsStayLocal(): void {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: `
const foo = JSON.parse('{"v":[{"1":2},{"3":4,"5":"text"}]}')

for (const a of foo.v) {
  const b = Object.values(a)
  const c = Object.values(a)[0]
  const d = Object.entries(a)
  const e = Object.entries(a)[0]
  console.log(foo, b, c, d, e)
}
`
      }
    ],
    {
      root: '/'
    }
  )
  const files = compileFileToCppModuleTextsSync(
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

  assert.doesNotMatch(source, /static void inox_main\(\) \{\n  \{/)
  assert.match(
    source,
    /\n  auto foo = JSON\.parse\("\{\\"v\\":\[\{\\"1\\":2\},\{\\"3\\":4,\\"5\\":\\"text\\"\}\]\}"\);/
  )
  assert.match(source, /if \(inox::thrown\(\)\) return;/)
  assert.doesNotMatch(source, /\n  inox::Value b;/)
  assert.doesNotMatch(source, /\n  inox::Value c;/)
  assert.doesNotMatch(source, /\n  inox::Value d;/)
  assert.doesNotMatch(source, /\n  inox::Value e;/)
  assert.doesNotMatch(source, /inox::Value foo;\n\s+foo = inox_undefined_value\(\);/)
  assert.doesNotMatch(source, /JSON\.parse\(inox::StringView\("[^"]+", \d+\), foo\)/)
  assert.match(source, /auto inox_library_iterator_\d+ = Array\(inox::get\(foo, "v"\)\)\.values\(\);/)
  assert.match(source, /while \(true\) \{/)
  assert.match(
    source,
    /auto (inox_library_step_\d+) = inox_library_iterator_\d+\.next\(\);\n    if \(\1\.done\) break;/
  )
  assert.match(source, /auto a = std::move\(inox_library_step_\d+\.value\);/)
  assert.doesNotMatch(source, /ArrayStorage|->items|inox_for_array_/)
  assert.match(source, /\n    auto b = Object\.values\(a\);\n    if \(inox::thrown\(\)\) return;/)
  assert.doesNotMatch(
    source,
    /auto inox_values_\d+ = Object\.values\(a\);\n    if \(inox::thrown\(\)\) return;\n    inox::Value b = inox_values_\d+;/
  )
  assert.match(source, /auto inox_library_result_\d+ = inox_library_object_\d+\.get\(0\);/)
  assert.match(source, /auto c = inox_library_result_\d+;/)
  assert.doesNotMatch(source, /\n    inox::Value c = inox_object_value_\d+;/)
  assert.doesNotMatch(source, /inox::Value c = inox::adopt\(inox_object_value_\d+\.release\(\)\);/)
  assert.match(source, /\n    auto d = Object\.entries\(a\);\n    if \(inox::thrown\(\)\) return;/)
  assert.doesNotMatch(
    source,
    /auto inox_entries_\d+ = Object\.entries\(a\);\n    if \(inox::thrown\(\)\) return;\n    inox::Value d = inox_entries_\d+;/
  )
  assert.equal(source.match(/auto inox_library_result_\d+ = inox_library_object_\d+\.get\(0\);/g)?.length, 1)
  assert.match(source, /auto e = inox_library_object_\d+\.get\(0\);/)
  assert.doesNotMatch(
    source,
    /if \(e\.tag != INOX_TAG_UNDEFINED && \(e\.tag != INOX_TAG_ARRAY \|\| e\.as\.ref == 0\)\) return;/
  )
  assert.doesNotMatch(source, /\n    inox::Value e = inox_object_entry_\d+;/)
  assert.doesNotMatch(source, /inox::Value e = inox::adopt\(inox_object_entry_\d+\.release\(\)\);/)
  assert.doesNotMatch(source, /inox::object_values\(a, inox_object_values_\d+\)/)
  assert.doesNotMatch(source, /inox::object_entries\(a, inox_object_entries_\d+\)/)
  assert.doesNotMatch(source, /inox_status inox_object_values_status_\d+/)
  assert.doesNotMatch(source, /inox_status inox_object_entries_status_\d+/)
  assert.doesNotMatch(source, /inox::adopt\(inox_(?:values|entries)_\d+\.release\(\)\)/)
  assert.doesNotMatch(source, /auto inox_value_\d+ = inox::get\(foo, "v"\);/)
  assert.doesNotMatch(source, /\.valid\(\)/)
  assert.doesNotMatch(source, /auto inox_library_value_\d+/)
  assert.doesNotMatch(source, /Object\.(?:values|entries)\(inox::Value\(a\)\)/)
  assert.doesNotMatch(source, /\.next\(\);\n    if \(inox::thrown\(\)\) return;/)
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
  assertRuntimeValueDeclarationsStayLocal()
}
