import assert from 'node:assert/strict'

import { compileFileToCModuleTextsSync } from '../../compiler/core.ts'
import { cStringLiteral, escapeCPrintfFormatText } from '../../compiler/c/identifiers.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'

type GeneratedTextFile = {
  path: string
  code: string
}

export function assertReadableCStringLiterals(): void {
  assert.equal(cStringLiteral('hello world'), '"hello world"')
  assert.equal(cStringLiteral('%s\n'), '"%s\\n"')
  assert.equal(cStringLiteral('"\\\t\r'), '"\\"\\\\\\t\\r"')
  assert.equal(cStringLiteral('\x01a'), '"\\x01" "a"')
  assert.equal(escapeCPrintfFormatText('100% ok'), '100%% ok')

  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: `
console.log('hello world')
const v = 123
console.log(\`num \${v} blabla\`)
const text: string = \`value \${v}%\`
console.log(text)
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

  assert.match(source, /printf\("hello world\\n"\);/)
  assert.match(source, /printf\("num %.17g blabla\\n", \(\(double\)v\)\);/)
  assert.match(source, /inox_string_from_format\(&inox_default_allocator, &inox_value_\d+, "value %.17g%%", \(\(double\)v\)\)/)
  assert.doesNotMatch(source, /\\x25/)
  assert.doesNotMatch(source, /\\x73/)
  assert.doesNotMatch(source, /\\x68/)
  assert.doesNotMatch(source, /printf\("%s\\n", "hello world"\);/)
  assert.doesNotMatch(source, /inox_string_concat_parts/)
}

function generatedTextFile(files: GeneratedTextFile[], path: string): GeneratedTextFile {
  for (const file of files) {
    if (file.path === path) {
      return file
    }
  }

  assert.fail(`missing generated file ${path}`)
}
