import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import type { AnyNode } from '../../compiler/types.ts'

test('recursive context keeps nested function fields after resolving function return type', () => {
  const result = compileSource(
    `
type Context = { dependencies: Dependencies }
type FunctionContext = Context & { active: boolean }
type Dependencies = { create(base: Context): FunctionContext; emit(context: FunctionContext): string }

function createContext(base: Context): FunctionContext {
  return base as FunctionContext
}

function emit(base: Context): string {
  return base.dependencies.emit(base as FunctionContext)
}
`,
    { target: 'cc' }
  )
  const createContext = result.ir.body.find((node) => node.name === 'createContext')
  const dependencies = createContext?.params?.[0]?.shape?.fields?.find(
    (field: AnyNode) => field.name === 'dependencies'
  )

  assert.deepEqual(dependencies?.shape?.fields?.map((field: AnyNode) => field.name), ['create', 'emit'])
  assert.match(result.code, /inox_callback_\d+ = inox::get\(inox_value_\d+, "emit"\);/)
  assert.match(result.code, /inox_callback_call\(inox_callback_\d+, inox_callback_args_\d+, 1,/)
  assert.doesNotMatch(result.code, /inox_objfn_/)
})
