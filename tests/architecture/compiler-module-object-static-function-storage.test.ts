import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileFileToCppModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('module object stores a named function with optional parameters as a runtime callback', () => {
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
  const files = compileFileToCppModuleTextsSync('/pkg/index.ts', {
    callMain: false,
    host,
    libraries: defaultCompilerLibrarySet,
    sourceRoot: '/pkg'
  })
  const source = files.find((file) => file.path === 'index.cc')

  assert.ok(source)
  assert.doesNotMatch(source.code, /inox_objfn_dependencies_adapt|\(\*dependencies_adapt\)/)
  assert.match(source.code, /static inox_status inox_callback_implementation_\d+\(/)
  assert.match(source.code, /inox_callback_new\(/)
  assert.match(source.code, /inox_object_\d+\.init\(0, inox_callback_\d+\);/)
})
