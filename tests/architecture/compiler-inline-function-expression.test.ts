import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSourceToIr } from '../../compiler/core.ts'

test('@inline const поддерживает function initializer с явным типом результата', () => {
  const compiled = compileSourceToIr(`
/** @inline */
export const increment = function (value: number): number {
  return value + 1
}
`)
  const declaration = compiled.hir.body[0]

  assert.equal(declaration.inline, true)
  assert.equal(declaration.init.functionSyntax, true)
  assert.equal(declaration.init.returnType, 'number')
})
