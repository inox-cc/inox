import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileFileToCModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('direct call bridges a static object function field into runtime callback storage', () => {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/index.ts',
        source: `
type Context = { dependencies: Dependencies }
type Dependencies = { pick(value: string): string | null }

function pick(value: string): string | null {
  return value
}

function use(context: Context): string {
  return context.dependencies.pick('Ada') ?? 'none'
}

const dependencies: Dependencies = { pick }
use({ dependencies })
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
  assert.match(
    source.code,
    /static inox_value use\(inox_value context, inox_value inox_objfn_context_dependencies_pick\)/
  )
  assert.match(source.code, /inox_function_pointer_callback_context_\d+->target = inox_objfn_dependencies_pick;/)
  assert.match(source.code, /use\(inox_object_\d+, inox_function_pointer_callback_\d+\);/)
})
