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

  assert.match(source, /if \(\s+\(inox_await_value_\d+\.tag != INOX_TAG_OBJECT/)
  assert.match(source, /if \(inox_await_value_\d+\.tag != INOX_TAG_STRING/)
  assert.doesNotMatch(source, /if \(txt_value_\d+\.tag != INOX_TAG_STRING/)
  assert.match(source, /if \(\s+\(inox_json_value_\d+\.tag != INOX_TAG_OBJECT/)
  assert.doesNotMatch(source, /if \(\(bad\.tag != INOX_TAG_OBJECT/)
  assert.match(source, /inox_object_values\(&inox_default_allocator, a, &inox_object_values_\d+\)/)
  assert.doesNotMatch(source, /if \(b\.tag != INOX_TAG_ARRAY/)
  assert.match(source, /inox_object_entries\(&inox_default_allocator, a, &inox_object_entries_\d+\)/)
  assert.doesNotMatch(source, /if \(d\.tag != INOX_TAG_ARRAY/)
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
