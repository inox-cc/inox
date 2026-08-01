import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import type { AnyNode } from '../../compiler/types.ts'

test('recursive type refresh updates shapes already nested in another type', () => {
  const result = compileSource(
    `
type Context = { dependencies: Dependencies }
type FunctionContext = Context & { active: boolean }
type Dependencies = { create(base: Context): FunctionContext; emit(context: FunctionContext): string }
type Outer = { context: Context }

function seed(): FunctionContext { throw 'error' }
function early(value: Outer): string {
  return value.context.dependencies.emit(value.context as FunctionContext)
}
function later(base: Context): Context { return base }
`,
    { target: 'cc' }
  )
  const early = result.ir.body.find((node) => node.name === 'early')
  const context = early?.params?.[0]?.shape?.fields?.find((field: AnyNode) => field.name === 'context')
  const dependencies = context?.shape?.fields?.find((field: AnyNode) => field.name === 'dependencies')

  assert.deepEqual(dependencies?.shape?.fields?.map((field: AnyNode) => field.name), ['create', 'emit'])
  assert.match(result.code, /inox_callback_\d+ = inox::get\(inox_value_\d+, "emit"\);/)
  assert.match(result.code, /inox_callback_call\(inox_callback_\d+, inox_callback_args_\d+, 1,/)
  assert.doesNotMatch(result.code, /inox_objfn_/)
})
