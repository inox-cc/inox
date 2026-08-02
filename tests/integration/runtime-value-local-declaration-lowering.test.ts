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
  const e = d[0]

  if (e === undefined) {
    continue
  }

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
  assert.match(
    source,
    /auto (inox_library_range_\d+) = Array\(inox::object_value_at\(foo, 0, "v"\)\)\.values\(\);\n\n  for \(auto a : \1\) \{/
  )
  assert.doesNotMatch(source, /ArrayStorage|->items|inox_for_array_/)
  assert.match(source, /\n\s+auto b = Object\.values\(a\);\n\s+if \(inox::thrown\(\)\) return;/)
  assert.doesNotMatch(
    source,
    /auto inox_values_\d+ = Object\.values\(a\);\n    if \(inox::thrown\(\)\) return;\n    inox::Value b = inox_values_\d+;/
  )
  assert.match(source, /auto c = Object\.values\(a\)\.get\(0\);\n\s+if \(inox::thrown\(\)\) return;/)
  assert.doesNotMatch(source, /auto c = inox_library_result_\d+;/)
  assert.doesNotMatch(source, /\n    inox::Value c = inox_object_value_\d+;/)
  assert.doesNotMatch(source, /inox::Value c = inox::adopt\(inox_object_value_\d+\.release\(\)\);/)
  assert.match(source, /\n\s+auto d = Object\.entries\(a\);\n\s+if \(inox::thrown\(\)\) return;/)
  assert.doesNotMatch(
    source,
    /auto inox_entries_\d+ = Object\.entries\(a\);\n    if \(inox::thrown\(\)\) return;\n    inox::Value d = inox_entries_\d+;/
  )
  assert.match(source, /auto e = d\.get\(0\);\n\s+if \(inox::thrown\(\)\) return;/)
  assert.match(source, /if \(e\.tag == INOX_TAG_UNDEFINED\)/)
  assert.doesNotMatch(source, /auto e = Array\(d\.get\(0\)\)/)
  assert.doesNotMatch(source, /inox_library_object_\d+\.get\(0\)/)
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
  assert.doesNotMatch(source, /while \(true\)/)
  assert.doesNotMatch(source, /\.next\(\)/)
  assert.doesNotMatch(source, /\.done/)
  assert.doesNotMatch(source, /INOX_TAG_OBJECT|INOX_TAG_CLASS_INSTANCE/)
  assert.doesNotMatch(source, /std::move/)
  assert.doesNotMatch(source, /auto inox_library_step_\d+/)
  assert.doesNotMatch(source, /auto inox_library_value_\d+/)
  assert.doesNotMatch(source, /auto inox_library_result_\d+/)
  assert.doesNotMatch(source, /Object\.(?:values|entries)\(inox::Value\(a\)\)/)
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
