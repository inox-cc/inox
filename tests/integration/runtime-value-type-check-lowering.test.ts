import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { compileFileToCModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'

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
  const files = compileFileToCModuleTextsSync('/pkg/src/index.ts', {
    callMain: true,
    host,
    loopBackend: 'libuv',
    sourceRoot: '/pkg'
  }) as GeneratedTextFile[]
  const source = generatedTextFile(files, 'src/index.cc').code

  assert.match(source, /auto inox_res_\d+ = inox::await<inox::FetchResponse>/)
  assert.match(source, /auto inox_res_\d+ = inox::await<inox::String>/)
  assert.match(source, /if \(inox::thrown\(\)\) goto catch_\d+;/)
  assert.doesNotMatch(source, /inox_await_result_\d+/)
  assert.doesNotMatch(source, /inox_res_\d+\.value\(\)\.valid\(\)/)
  assert.match(source, /auto txt = inox_res_\d+\.value\(\);/)
  assert.doesNotMatch(source, /inox::String txt = inox_res_\d+\.value\(\);/)
  assert.doesNotMatch(source, /if \(txt_value_\d+\.tag != INOX_TAG_STRING/)
  assert.match(source, /auto bad = JSON\.parse\(inox::string_view\(/)
  assert.match(source, /if \(inox::thrown\(\)\) goto catch_\d+;/)
  assert.match(source, /if \(\(foo\.tag != INOX_TAG_OBJECT/)
  assert.doesNotMatch(source, /if \(\(bad\.tag != INOX_TAG_OBJECT/)
  assert.match(source, /auto inox_values_\d+ = Object\.values\(a\);\n    if \(inox::thrown\(\)\) return INOX_ERR_TYPE;/)
  assert.doesNotMatch(source, /inox::object_values\(a, inox_object_values_\d+\)/)
  assert.doesNotMatch(source, /inox_object_values\(&inox_default_allocator, a, &inox_object_values_\d+\)/)
  assert.doesNotMatch(source, /if \(b\.tag != INOX_TAG_ARRAY/)
  assert.match(source, /auto inox_entries_\d+ = Object\.entries\(a\);\n    if \(inox::thrown\(\)\) return INOX_ERR_TYPE;/)
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
