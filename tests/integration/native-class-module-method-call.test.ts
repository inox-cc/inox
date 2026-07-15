import assert from 'node:assert/strict'

import { compileFileToCModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

type GeneratedTextFile = {
  path: string
  code: string
}

export function assertNativeClassModuleMethodCallUsesNativeReceiver(): void {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: `
class Foo {
  name: string

  constructor(name: string) {
    this.name = name
  }

  test(): void {
    console.log(this.name)
  }
}

const f = new Foo('foo 1')
f.test()
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
    libraries: defaultCompilerLibrarySet,
    sourceRoot: '/pkg'
  }) as GeneratedTextFile[]
  const source = generatedTextFile(files, 'src/index.cc').code

  assert.match(source, /class Foo/)
  assert.match(source, /Foo f\{inox::String\("foo 1", 5\)\}/)
  assert.match(source, /f\.test\(\)/)
  assert.doesNotMatch(source, /inox_mod_src_index_ts_[0-9a-f]+_Foo/)
  assert.doesNotMatch(source, /inox_mod_src_index_ts_[0-9a-f]+_f/)
  assert.doesNotMatch(source, /f\.tag/)
  assert.doesNotMatch(source, /f\.as\.ref/)
}

function generatedTextFile(files: GeneratedTextFile[], path: string): GeneratedTextFile {
  for (const file of files) {
    if (file.path === path) {
      return file
    }
  }

  assert.fail(`missing generated file ${path}`)
}
