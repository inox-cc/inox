import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { compileFileToCppModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibraryLiteralTypeInference, defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

type GeneratedTextFile = {
  path: string
  code: string
}

export function assertRuntimeValueDeclarationsReuseTypedHelperContracts(): void {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: `
try {
  const res = await fetch('http://example.com/')
  const txt = await res.text()
  console.log(txt)
} catch (error) {
  console.log(error)
}

try {
  const bad = JSON.parse('{"v":{"1":2},{"3":4,"5":6}]}')
  console.log(bad)
} catch (error) {
  console.log(error)
}

const foo = JSON.parse('{"v":[{"1":2},{"3":4,"5":"text"}]}')

for (const a of foo.v) {
  const b = Object.values(a)
  console.log(b)
  const d = Object.entries(a)
  console.log(d)
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
      libraryOptions: [{ optionId: 'target:runtime#loop-backend', value: 'libuv' }],
      sourceRoot: '/pkg'
    },
    defaultCompilerLibraryLiteralTypeInference
  ) as GeneratedTextFile[]
  const source = generatedTextFile(files, 'src/index.cc').code

  assert.match(
    source,
    /auto res = inox::FetchResponse\(inox::fetch\("http:\/\/example.com\/"\)\.awaitValue\(\)\);\n\s+if \(inox::thrown\(\)\) goto catch_\d+;/
  )
  assert.match(
    source,
    /auto txt = inox::String\(res\.text\(\)\.awaitValue\(\)\);\n\s+if \(inox::thrown\(\)\) goto catch_\d+;/
  )
  assert.doesNotMatch(source, /inox::await_value</)
  assert.doesNotMatch(source, /inox_library_asyncResult_\d+/)
  assert.doesNotMatch(source, /inox_await_converted_\d+/)
  assert.doesNotMatch(source, /inox_await_source_\d+/)
  assert.doesNotMatch(source, /inox_await_value_\d+/)
  assert.match(source, /if \(inox::thrown\(\)\) goto catch_\d+;/)
  assert.doesNotMatch(source, /inox_await_result_\d+/)
  assert.doesNotMatch(source, /inox_res_\d+\.value\(\)\.valid\(\)/)
  assert.doesNotMatch(source, /auto txt = inox_res_\d+\.value\(\);/)
  assert.doesNotMatch(source, /inox::String txt = inox_res_\d+\.value\(\);/)
  assert.doesNotMatch(source, /if \(txt_value_\d+\.tag != INOX_TAG_STRING/)
  assert.match(source, /auto bad = JSON\.parse\(/)
  assert.match(source, /if \(inox::thrown\(\)\) goto catch_\d+;/)
  assert.doesNotMatch(source, /if \(\(foo\.tag != INOX_TAG_OBJECT/)
  assert.doesNotMatch(source, /if \(\(bad\.tag != INOX_TAG_OBJECT/)
  assert.match(source, /auto b = Object\.values\(a\);\n    if \(inox::thrown\(\)\) return;/)
  assert.doesNotMatch(
    source,
    /auto inox_values_\d+ = Object\.values\(a\);\n    if \(inox::thrown\(\)\) return;\n    inox::Value b = inox_values_\d+;/
  )
  assert.doesNotMatch(source, /inox::object_values\(a, inox_object_values_\d+\)/)
  assert.doesNotMatch(source, /inox_object_values\(&inox_default_allocator, a, &inox_object_values_\d+\)/)
  assert.doesNotMatch(source, /if \(b\.tag != INOX_TAG_ARRAY/)
  assert.match(source, /auto d = Object\.entries\(a\);\n    if \(inox::thrown\(\)\) return;/)
  assert.doesNotMatch(
    source,
    /auto inox_entries_\d+ = Object\.entries\(a\);\n    if \(inox::thrown\(\)\) return;\n    inox::Value d = inox_entries_\d+;/
  )
  assert.doesNotMatch(source, /inox::object_entries\(a, inox_object_entries_\d+\)/)
  assert.doesNotMatch(source, /inox_object_entries\(&inox_default_allocator, a, &inox_object_entries_\d+\)/)
  assert.doesNotMatch(source, /if \(d\.tag != INOX_TAG_ARRAY/)
  assert.doesNotMatch(source, /inox::adopt\(inox_(?:values|entries)_\d+\.release\(\)\)/)
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
  assertRuntimeValueDeclarationsReuseTypedHelperContracts()
}
