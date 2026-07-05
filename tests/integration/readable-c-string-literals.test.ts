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

  assert.match(source, /console\.log\("hello world"\);/)
  assert.match(source, /console\.log\("num %.17g blabla", \(\(double\)v\)\);/)
  assert.match(source, /inox_string_from_format\(&inox_default_allocator, &inox_value_\d+, "value %.17g%%", \(\(double\)v\)\)/)
  assert.match(source, /console\.log\(text_value_\d+\);/)
  assert.match(source, /console\.log\("label %s", inox::StringView\(text->bytes, text->len\)\);/)
  assert.doesNotMatch(source, /\\x25/)
  assert.doesNotMatch(source, /\\x73/)
  assert.doesNotMatch(source, /\\x68/)
  assert.doesNotMatch(source, /printf\("%s\\n", "hello world"\);/)
  assert.doesNotMatch(source, /printf\(/)
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

  assert.match(runtimeValueSource, /console\.log\(user\);/)
  assert.match(runtimeValueSource, /console\.log\("user", user\);/)
  assert.match(runtimeValueSource, /console\.error\("bad", user\);/)
  assert.doesNotMatch(runtimeValueSource, /inox::console_log/)
  assert.doesNotMatch(runtimeValueSource, /inox_console_print_value_line\(INOX_CONSOLE_STDOUT, user\)/)
  assert.doesNotMatch(runtimeValueSource, /inox_console_printf\(INOX_CONSOLE_STDERR, "bad "\)/)
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
  assert.match(entryLocalSource, /Foo f\{inox::String\(inox::string\("x", 1\)\)\};/)
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

  assert.match(jsonLocalSource, /auto data = JSON\.parse\("\{\\"v\\":\[1\]\}"\);/)
  assert.match(jsonLocalSource, /if \(inox::thrown\(\)\) return;/)
  assert.doesNotMatch(jsonLocalSource, /JSON\.parse\(inox::StringView/)
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

  assert.match(
    fetchSource,
    /inox::fetch\("http:\/\/127\.0\.0\.1"\)/
  )
  assert.doesNotMatch(fetchSource, /inox::fetch\(inox::StringView/)

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

  assert.match(processEntrySource, /inox::main\(argc, argv, "src\/index\.ts", inox_main\)/)
  assert.doesNotMatch(processEntrySource, /inox::main\(argc, argv, "\/pkg\//)
}

function generatedTextFile(files: GeneratedTextFile[], path: string): GeneratedTextFile {
  for (const file of files) {
    if (file.path === path) {
      return file
    }
  }

  assert.fail(`missing generated file ${path}`)
}
