import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileFileToCModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('recursive object function companions keep a lossless static pointer ABI', () => {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/index.ts',
        source: `
import { implementation } from './implementation.ts'

type Context = { dependencies: Dependencies }
type Dependencies = { adapt(value: object, context: Context): object | null }
type RuntimeDependencies = { adapt(value: object, context: Context, label?: string): object | null }

function consume(dependencies: Dependencies): void {}

const dependencies: RuntimeDependencies = {
  adapt: (value, context, label) => implementation(value, context, label)
}
consume(dependencies)
`
      },
      {
        path: '/pkg/implementation.ts',
        source: `
export function implementation(value: object, context: object, label?: string): object | null {
  return null
}
`
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
  assert.match(
    source.code,
    /static inox_value \(\*inox_objfn_dependencies_adapt\)\(inox_value, inox_value, inox_value \(\*\)\(inox_value, inox_value\), inox_value\) = 0;/
  )
  assert.match(
    source.code,
    /return inox_objfn_dependencies_adapt\(inox_arg_0, inox_arg_1, inox_objfn_dependencies_adapt, inox_undefined_value\(\)\);/
  )
  assert.doesNotMatch(source.code, /inox_callback_call\(inox_objfn_dependencies_adapt/)
})
