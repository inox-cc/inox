import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileFileToCModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('function pointer adapter bridges a static companion into runtime callback storage', () => {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/index.ts',
        source: `
type Context = { dependencies: Dependencies }
type Dependencies = {
  run(context: Context): string
  pick(value: string): string | null
}
type RuntimeDependencies = {
  run(context: Context, label?: string): string
  pick(value: string): string | null
}

function pick(value: string): string | null {
  return value
}

function run(context: Context, label?: string): string {
  return context.dependencies.pick(label ?? 'Ada') ?? 'none'
}

function consume(dependencies: Dependencies): void {}

const dependencies: RuntimeDependencies = { run, pick }
consume(dependencies)
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
  assert.match(source.code, /static inox_value \(\*inox_objfn_dependencies_pick\)\(inox_value\) = 0;/)
  assert.match(source.code, /inox_adapter_callback_context_\d+->target = inox_objfn_dependencies_pick;/)
  assert.match(
    source.code,
    /inox_objfn_dependencies_run\(inox_arg_0, inox_objfn_dependencies_run, inox_adapter_callback_\d+/
  )
  assert.doesNotMatch(
    source.code,
    /inox_objfn_dependencies_run\(inox_arg_0, inox_objfn_dependencies_run, inox_objfn_dependencies_pick/
  )
})
