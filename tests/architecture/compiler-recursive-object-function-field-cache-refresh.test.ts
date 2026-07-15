import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'

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

  assert.match(result.code, /inox_value early\([\s\S]*inox_objfn_value_context_dependencies_create/)
  assert.match(result.code, /inox_value early\([\s\S]*inox_objfn_value_context_dependencies_emit/)
})
