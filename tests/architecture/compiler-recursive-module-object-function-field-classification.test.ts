import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileFileToCppModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('recursive object function fields keep a lossless runtime callback ABI', () => {
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
  const files = compileFileToCppModuleTextsSync('/pkg/index.ts', {
    callMain: false,
    host,
    libraries: defaultCompilerLibrarySet,
    sourceRoot: '/pkg'
  })
  const source = files.find((file) => file.path === 'index.cc')

  assert.ok(source)
  assert.doesNotMatch(source.code, /inox_objfn_dependencies_adapt|inox_function_pointer_adapter/)
  assert.match(source.code, /static inox_status inox_callback_arrow_\d+\(/)
  assert.match(source.code, /inox_value inox_callback_padded_args\[3\];/)
  assert.match(source.code, /inox_callback_new\(&inox_default_allocator, inox_callback_arrow_\d+, 0, 0,/)
  assert.match(source.code, /inox_object_\d+\.init\(0, inox_callback_\d+\);/)
})
