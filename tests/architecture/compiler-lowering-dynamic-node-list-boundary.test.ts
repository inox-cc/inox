import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

test('lowering validates dynamic AST lists before iterating them', () => {
  const expressions = readFileSync(new URL('../../compiler/lower/expressions.ts', import.meta.url), 'utf8')
  const statements = readFileSync(new URL('../../compiler/lower/statements.ts', import.meta.url), 'utf8')

  assert.match(expressions, /function lowerExpressionNodeArrayOrEmpty\(value: unknown\)/)
  assert.match(expressions, /lowerExpressionNodeArrayOrEmpty\(expression\.body\)/)
  assert.match(expressions, /lowerExpressionNodeArrayOrEmpty\(expression\.params\)/)
  assert.match(expressions, /function lowerArrayBindingElementsOrEmpty\(value: unknown\): ArrayBindingElement\[\]/)
  assert.match(expressions, /lowerArrayBindingElementsOrEmpty\(param\.bindingElements\)/)
  assert.match(statements, /function lowerNodeArrayOrEmpty\(value: unknown\)/)
  assert.match(statements, /function lowerArrayBindingElementsOrEmpty\(value: unknown\): ArrayBindingElement\[\]/)
  assert.match(statements, /lowerArrayBindingElementsOrEmpty\(statement\.bindingElements\)/)
  assert.match(statements, /lowerNodeArrayOrEmpty\(body\.body\)/)
})
