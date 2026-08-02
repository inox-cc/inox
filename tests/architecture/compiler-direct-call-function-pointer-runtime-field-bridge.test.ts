import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileFileToCppModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('direct call reads an object function field from runtime callback storage', () => {
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
  const files = compileFileToCppModuleTextsSync('/pkg/index.ts', {
    callMain: false,
    host,
    libraries: defaultCompilerLibrarySet,
    sourceRoot: '/pkg'
  })
  const source = files.find((file) => file.path === 'index.cc')

  assert.ok(source)
  assert.doesNotMatch(source.code, /inox_objfn_|inox_function_pointer_callback/)
  assert.match(source.code, /static inox::String use\(inox_value context\)/)
  assert.match(source.code, /inox_callback_\d+ = inox::get\(inox_value_\d+, "pick"\);/)
  assert.match(source.code, /inox_callback_call\(inox_callback_\d+, inox_callback_args_\d+, 1,/)
  assert.match(source.code, /inox_callback_new\(&inox_default_allocator, inox_callback_pick_\d+, 0, 0,/)
})
