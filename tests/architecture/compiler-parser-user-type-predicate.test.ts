import assert from 'node:assert/strict'
import { test } from 'node:test'

import { tokenize } from '../../compiler/lexer.ts'
import { parse } from '../../compiler/parser.ts'

test('parser сохраняет пользовательский type predicate как boolean-контракт', () => {
  const program = parse(
    tokenize('function isString(value: unknown): value is string { return typeof value === "string" }\n', {})
  )
  const declaration = program.body[0]

  assert.equal(declaration.returnType, 'boolean')
  assert.equal(declaration.declaredReturnType, 'boolean')
  assert.equal(declaration.typePredicateParameterName, 'value')
  assert.equal(declaration.typePredicateType, 'string')
})
