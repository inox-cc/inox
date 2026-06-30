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
  assert.match(
    source,
    /inox_string\* (inox_log_string_\d+) = \(inox_string\*\)text\.as\.ref;\n    printf\("%\.\*s\\n", \(int\)\1->len, \1->bytes\);/
  )
  assert.doesNotMatch(source, /\\x25/)
  assert.doesNotMatch(source, /\\x73/)
  assert.doesNotMatch(source, /\\x68/)
  assert.doesNotMatch(source, /printf\("%s\\n", "hello world"\);/)
  assert.doesNotMatch(source, /double inox_return = 0;/)
  assert.doesNotMatch(source, /inox_console_format_value/)
  assert.doesNotMatch(source, /inox_string_concat_parts/)

  const fetchHost = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: `
const response = await fetch('http://127.0.0.1')
console.log(response.status)
`
      }
    ],
    {
      root: '/'
    }
  )
  const fetchFiles = compileFileToCModuleTextsSync('/pkg/src/index.ts', {
    callMain: true,
    host: fetchHost,
    loopBackend: 'libuv',
    sourceRoot: '/pkg'
  }) as GeneratedTextFile[]
  const fetchSource = generatedTextFile(fetchFiles, 'src/index.cc').code

  assert.match(fetchSource, /inox_fetch\(&inox_loop, "http:\/\/127\.0\.0\.1", 16, &inox_promise_\d+\)/)
}

function generatedTextFile(files: GeneratedTextFile[], path: string): GeneratedTextFile {
  for (const file of files) {
    if (file.path === path) {
      return file
    }
  }

  assert.fail(`missing generated file ${path}`)
}
