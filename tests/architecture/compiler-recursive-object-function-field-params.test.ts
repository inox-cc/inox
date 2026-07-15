import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'

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

  assert.match(result.code, /inox_value createContext\([\s\S]*inox_objfn_base_dependencies_create/)
  assert.match(result.code, /inox_value emit\([\s\S]*inox_objfn_base_dependencies_emit/)
  assert.match(result.code, /inox_objfn_base_dependencies_emit\(base\)/)
})
