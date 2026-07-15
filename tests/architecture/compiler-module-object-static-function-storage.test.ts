import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileFileToCModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('module object stores a named function with optional parameters as a static pointer', () => {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/index.ts',
        source: "import { implementation } from './implementation.ts'\nconst dependencies = { adapt: implementation }\n"
      },
      {
        path: '/pkg/implementation.ts',
        source: 'export function implementation(value: object, label?: string): object | null { return value }\n'
      }
    ],
    { root: '/' }
  )
  const files = compileFileToCModuleTextsSync('/pkg/index.ts', {
    callMain: false,
    host,
    libraries: defaultCompilerLibrarySet,
    sourceRoot: '/pkg'
  })
  const source = files.find((file) => file.path === 'index.cc')

  assert.ok(source)
  assert.match(source.code, /static inox_value \(\*inox_objfn_dependencies_adapt\)\(inox_value, inox_value\) = 0;/)
  assert.match(
    source.code,
    /inox_objfn_dependencies_adapt = inox_mod_implementation_ts_[a-f0-9]+_implementation;/
  )
  assert.doesNotMatch(source.code, /inox_callback_new\([^\n]*dependencies_adapt/)
})
