import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { compileFileToCModuleTextsSync, compileSource } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'

type GeneratedTextFile = {
  path: string
  code: string
}

export function assertNativeClassAsyncStateDoesNotSplitMethods(): void {
  const sourceText = `
class Foo {
  name: string

  constructor(name: string) {
    this.name = name
  }

  test() {
    console.log(this.name)
  }
}

function run(): void {
  const promise = Promise.reject('bad')
  console.log('done')
}

const f = new Foo('foo 1')
f.test()
console.log(f)
run()
`
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: sourceText
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
  assertNativeClassMethodOrder(source)

  const unitResult = compileSource(sourceText, {
    target: 'cc'
  })

  assertNativeClassMethodOrder(unitResult.code)
}

function assertNativeClassMethodOrder(source: string): void {
  const classMatch = /class [^\n]*Foo[^\n]*\{\n/.exec(source)
  const classIndex = classMatch !== null ? classMatch.index : -1
  const classEndIndex = source.indexOf('};', classIndex)
  const constructorIndex = source.indexOf('Foo::Foo(')
  const methodIndex = source.indexOf('void Foo::test()')
  const runPrototypeMatch = /\b(?:static )?[A-Za-z_][A-Za-z0-9_:*<>, ]* run\([^)]*\);/.exec(source)
  const runPrototypeIndex = runPrototypeMatch !== null ? runPrototypeMatch.index : -1
  const flagIndex = source.indexOf('static int inox_mod_src_index_ts_')
  const runDefinitionMatch = /\b(?:static )?[A-Za-z_][A-Za-z0-9_:*<>, ]* run\([^)]*\) \{/.exec(source)
  const runDefinitionIndex = runDefinitionMatch !== null ? runDefinitionMatch.index : -1
  const mainIndex = source.indexOf('int main(')

  assert.notEqual(classIndex, -1, 'missing Foo class declaration')
  assert.notEqual(classEndIndex, -1, 'missing Foo class declaration end')
  assert.notEqual(constructorIndex, -1, 'missing Foo constructor definition')
  assert.notEqual(methodIndex, -1, 'missing Foo::test definition')
  assert.notEqual(runPrototypeIndex, -1, 'missing run function prototype')
  assert.equal(flagIndex, -1, 'unhandled rejection state should live in runtime')
  assert.notEqual(runDefinitionIndex, -1, 'missing run function definition')
  assert.notEqual(mainIndex, -1, 'missing module main')
  assert.ok(runPrototypeIndex < classIndex, 'function prototypes should not split class declarations from methods')
  assert.ok(classIndex < constructorIndex, 'class declaration should precede constructor definition')
  assert.equal(
    source.slice(classEndIndex + 2, constructorIndex).trim(),
    '',
    'class declaration should stay directly next to constructor definition'
  )
  assert.ok(constructorIndex < methodIndex, 'constructor definition should stay with class method definitions')
  assert.ok(methodIndex < runDefinitionIndex, 'function definitions should not split class method definitions')
  assert.ok(runDefinitionIndex < mainIndex, 'function definitions should stay before main')
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
  assertNativeClassAsyncStateDoesNotSplitMethods()
}
