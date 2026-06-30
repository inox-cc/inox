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
console.log('label', text)
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
  assert.match(source, /printf\("label %\.\*s\\n", \(int\)inox_log_string_\d+->len, inox_log_string_\d+->bytes\);/)
  assert.doesNotMatch(source, /\\x25/)
  assert.doesNotMatch(source, /\\x73/)
  assert.doesNotMatch(source, /\\x68/)
  assert.doesNotMatch(source, /printf\("%s\\n", "hello world"\);/)
  assert.doesNotMatch(source, /double inox_return = 0;/)
  assert.doesNotMatch(source, /inox_console_format_value/)
  assert.doesNotMatch(source, /inox_string_concat_parts/)

  const runtimeValueHost = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: `
const user = { name: 'Ada', score: 7 }
console.log(user)
console.log('user', user)
console.error('bad', user)
`
      }
    ],
    {
      root: '/'
    }
  )
  const runtimeValueFiles = compileFileToCModuleTextsSync('/pkg/src/index.ts', {
    callMain: true,
    host: runtimeValueHost,
    sourceRoot: '/pkg'
  }) as GeneratedTextFile[]
  const runtimeValueSource = generatedTextFile(runtimeValueFiles, 'src/index.cc').code

  assert.match(runtimeValueSource, /inox_console_print_value_line\(INOX_CONSOLE_STDOUT, user\)/)
  assert.match(runtimeValueSource, /printf\("user "\);\n\s+if \(inox_console_print_value\(INOX_CONSOLE_STDOUT, user\) != INOX_OK\)/)
  assert.match(runtimeValueSource, /inox_console_printf\(INOX_CONSOLE_STDERR, "bad "\)/)
  assert.match(runtimeValueSource, /inox_console_print_value\(INOX_CONSOLE_STDERR, user\)/)
  assert.doesNotMatch(runtimeValueSource, /inox_console_format_value/)

  const entryLocalHost = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: `
const v = 123
console.log(v)

class Foo {
  name: string

  constructor(name: string) {
    this.name = name
  }

  test() {
    console.log(this.name)
  }
}

const f = new Foo('x')
f.test()
`
      }
    ],
    {
      root: '/'
    }
  )
  const entryLocalFiles = compileFileToCModuleTextsSync('/pkg/src/index.ts', {
    callMain: true,
    host: entryLocalHost,
    sourceRoot: '/pkg'
  }) as GeneratedTextFile[]
  const entryLocalSource = generatedTextFile(entryLocalFiles, 'src/index.cc').code

  assert.match(entryLocalSource, /double v = 123;/)
  assert.match(entryLocalSource, /Foo f\{inox::string\("x", 1\)\};/)
  assert.doesNotMatch(entryLocalSource, /static double v/)
  assert.doesNotMatch(entryLocalSource, /static Foo f/)

  const nestedReferenceHost = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: `
const seed = 7

function read(): number {
  return seed
}

console.log(read())
`
      }
    ],
    {
      root: '/'
    }
  )
  const nestedReferenceFiles = compileFileToCModuleTextsSync('/pkg/src/index.ts', {
    callMain: true,
    host: nestedReferenceHost,
    sourceRoot: '/pkg'
  }) as GeneratedTextFile[]
  const nestedReferenceSource = generatedTextFile(nestedReferenceFiles, 'src/index.cc').code

  assert.match(nestedReferenceSource, /static double seed = 0;/)
  assert.match(nestedReferenceSource, /inox_return = seed;/)

  const jsonLocalHost = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: `
const data = JSON.parse('{"v":[1]}')
console.log(data.v)
`
      }
    ],
    {
      root: '/'
    }
  )
  const jsonLocalFiles = compileFileToCModuleTextsSync('/pkg/src/index.ts', {
    callMain: true,
    host: jsonLocalHost,
    sourceRoot: '/pkg'
  }) as GeneratedTextFile[]
  const jsonLocalSource = generatedTextFile(jsonLocalFiles, 'src/index.cc').code

  assert.match(jsonLocalSource, /inox_json_parse\(&inox_default_allocator, "\{\\"v\\":\[1\]\}", 9, &data\)/)
  assert.doesNotMatch(jsonLocalSource, /inox_object_new/)
  assert.doesNotMatch(jsonLocalSource, /inox_shape_data/)

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

  assert.match(fetchSource, /inox_fetch\(&inox_loop, inox::string_view\("http:\/\/127\.0\.0\.1"\), &inox_promise_\d+\)/)
  assert.doesNotMatch(fetchSource, /inox_fetch\(&inox_loop, "http:\/\/127\.0\.0\.1", 16,/)

  const processEntryHost = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: `
console.log(process.argv[1])
`
      }
    ],
    {
      root: '/'
    }
  )
  const processEntryFiles = compileFileToCModuleTextsSync('/pkg/src/index.ts', {
    callMain: true,
    host: processEntryHost,
    sourceRoot: '/pkg'
  }) as GeneratedTextFile[]
  const processEntrySource = generatedTextFile(processEntryFiles, 'src/index.cc').code

  assert.match(processEntrySource, /inox_process_init_with_entry\(argc, argv, "src\/index\.ts"\)/)
  assert.doesNotMatch(processEntrySource, /inox_process_init_with_entry\(argc, argv, "\/pkg\//)
}

function generatedTextFile(files: GeneratedTextFile[], path: string): GeneratedTextFile {
  for (const file of files) {
    if (file.path === path) {
      return file
    }
  }

  assert.fail(`missing generated file ${path}`)
}
