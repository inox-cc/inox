import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileFileToCModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('object function field adapts pointer storage to canonical runtime callback ABI', () => {
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
  const files = compileFileToCModuleTextsSync('/pkg/index.ts', {
    callMain: false,
    host,
    libraries: defaultCompilerLibrarySet,
    sourceRoot: '/pkg'
  })
  const source = files.find((file) => file.path === 'index.cc')

  assert.ok(source)
  assert.match(source.code, /static inox_value \(\*inox_objfn_dependencies_pick\)\(inox_value\) = 0;/)
  assert.match(source.code, /typedef struct inox_function_pointer_runtime_context_\d+ \{/)
  assert.match(source.code, /inox_value \(\*target\)\(inox_value\);/)
  assert.match(
    source.code,
    /inox_callback_new\(\s*&inox_default_allocator,\s*inox_function_pointer_runtime_callback_\d+,\s*inox_function_pointer_callback_context_\d+,\s*inox_function_pointer_runtime_finalize_\d+,\s*&inox_function_pointer_callback_\d+\s*\)/
  )
  assert.doesNotMatch(source.code, /consume\([^;]+, inox_objfn_dependencies_pick\);/)
})
