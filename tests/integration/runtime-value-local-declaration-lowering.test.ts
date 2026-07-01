import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { compileFileToCModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'

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
  const files = compileFileToCModuleTextsSync('/pkg/src/index.ts', {
    callMain: true,
    host,
    sourceRoot: '/pkg'
  }) as GeneratedTextFile[]
  const source = generatedTextFile(files, 'src/index.cc').code
  const mainPrelude = source.slice(source.indexOf('int main('), source.indexOf('  {', source.indexOf('int main(')))

  assert.doesNotMatch(mainPrelude, /inox::Value foo;/)
  assert.doesNotMatch(mainPrelude, /inox::Value b;/)
  assert.doesNotMatch(mainPrelude, /inox::Value c;/)
  assert.doesNotMatch(mainPrelude, /inox::Value d;/)
  assert.doesNotMatch(mainPrelude, /inox::Value e;/)
  assert.match(source, /\n    inox::Value foo;/)
  assert.doesNotMatch(source, /inox::Value foo;\n\s+foo = inox_undefined_value\(\);/)
  assert.match(source, /\n        inox::Value b = inox::adopt\(inox_object_values_\d+\.release\(\)\);/)
  assert.match(source, /\n        inox::Value c = inox::adopt\(inox_object_value_\d+\.release\(\)\);/)
  assert.match(source, /\n        inox::Value d = inox::adopt\(inox_object_entries_\d+\.release\(\)\);/)
  assert.match(source, /\n        inox::Value e = inox::adopt\(inox_object_entry_\d+\.release\(\)\);/)
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
