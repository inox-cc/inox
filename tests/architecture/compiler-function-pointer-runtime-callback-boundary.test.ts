import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileFileToCppModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('object function fields use the canonical runtime callback ABI', () => {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/index.ts',
        source: `
type Dependencies = { pick(value: string): string | null }

function pick(value: string): string | null {
  return value
}

const dependencies: Dependencies = { pick }

function consume(value: Dependencies): string {
  return value.pick('Ada') ?? 'none'
}

function consumeRuntime(prefix: string): string {
  const runtimeDependencies: Dependencies = {
    pick: (value) => prefix + value
  }
  return consume(runtimeDependencies)
}

consume(dependencies)
consumeRuntime('hello ')
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
  assert.doesNotMatch(source.code, /inox_objfn_|inox_function_pointer_runtime/)
  assert.match(source.code, /static inox_status inox_callback_pick_\d+\(/)
  assert.match(source.code, /static inox_status inox_callback_arrow_\d+\(/)
  assert.match(source.code, /inox_callback_new\(/)
  assert.match(source.code, /inox_callback_call\(/)
})
