import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileFileToCppModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('object function call keeps a native Set result', () => {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/index.ts',
        source: `
type Context = { values: Set<string> }
type Dependencies = { collect(): Set<string> }

function collect(): Set<string> {
  return new Set<string>()
}

function apply(context: Context, dependencies: Dependencies): void {
  context.values = dependencies.collect()
}

const context: Context = { values: new Set<string>() }
const dependencies: Dependencies = { collect }
apply(context, dependencies)
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
  assert.doesNotMatch(source.code, /inox_objfn_dependencies_collect/)
  assert.match(source.code, /auto inox_callback_result = collect\(\);/)
  assert.match(source.code, /\*inox_callback_out = inox_callback_result\.release\(\);/)
  assert.match(source.code, /inox_callback_\d+ = inox::get\(dependencies, "collect"\);/)
  assert.match(source.code, /if \(!\(Set\(inox::Value\(inox_value_\d+\)\)\.valid\(\)\)\) return;/)
  assert.match(source.code, /inox_object_set\(context, "values", 6, inox_value_\d+\)/)
})
