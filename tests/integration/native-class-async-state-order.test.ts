import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { compileFileToCppModuleTextsSync, compileSource } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

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
  const files = compileFileToCppModuleTextsSync('/pkg/src/index.ts', {
    callMain: true,
    host,
    libraries: defaultCompilerLibrarySet,
    sourceRoot: '/pkg'
  }) as GeneratedTextFile[]
  const source = generatedTextFile(files, 'src/index.cc').code
  assertNativeClassMethodOrder(source)

  const unitResult = compileSource(sourceText, {
    libraries: defaultCompilerLibrarySet,
    target: 'cc'
  })

  assertNativeClassMethodOrder(unitResult.code)
}

function assertNativeClassMethodOrder(source: string): void {
  const classMatch = /class [^\n]*Foo[^\n]*\{\n/.exec(source)
  const classIndex = classMatch !== null ? classMatch.index : -1
  const classEndIndex = source.indexOf('};', classIndex)
  const constructorIndex = source.indexOf('Foo(', classIndex)
  const methodIndex = source.indexOf('void test()', classIndex)
  const runPrototypeMatch = /\b(?:static )?[A-Za-z_][A-Za-z0-9_:*<>, ]* run\([^)]*\);/.exec(source)
  const runPrototypeIndex = runPrototypeMatch !== null ? runPrototypeMatch.index : -1
  const classForwardIndex = source.indexOf('class Foo;')
  const flagIndex = source.indexOf('static int inox_mod_src_index_ts_')
  const runDefinitionMatch = /\b(?:static )?[A-Za-z_][A-Za-z0-9_:*<>, ]* run\([^)]*\) \{/.exec(source)
  const runDefinitionIndex = runDefinitionMatch !== null ? runDefinitionMatch.index : -1
  const mainIndex = source.indexOf('int main(')

  assert.notEqual(classIndex, -1, 'missing Foo class declaration')
  assert.notEqual(classEndIndex, -1, 'missing Foo class declaration end')
  assert.notEqual(constructorIndex, -1, 'missing Foo constructor definition')
  assert.notEqual(methodIndex, -1, 'missing inline Foo::test definition')
  assert.equal(classForwardIndex, -1, 'unneeded native class forward declaration should not be emitted')
  assert.equal(runPrototypeIndex, -1, 'unneeded run function prototype should not be emitted')
  assert.equal(flagIndex, -1, 'unhandled rejection state should live in runtime')
  assert.notEqual(runDefinitionIndex, -1, 'missing run function definition')
  assert.notEqual(mainIndex, -1, 'missing module main')
  assert.ok(classIndex < constructorIndex, 'class should contain its constructor definition')
  assert.ok(constructorIndex < methodIndex, 'constructor definition should precede class method definitions')
  assert.ok(methodIndex < classEndIndex, 'class should contain its method definitions')
  assert.ok(classEndIndex < runDefinitionIndex, 'function definitions should not split the class definition')
  assert.doesNotMatch(source, /Foo::Foo|Foo::test/)
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
