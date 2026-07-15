import assert from 'node:assert/strict'
import { test } from 'node:test'

import { tokenize } from '../../compiler/lexer.ts'
import { parse } from '../../compiler/parser.ts'

test('parser заранее объявляет изменяемые checker metadata поля функции и параметра', () => {
  const declaration = parse(tokenize('function value(input: string): string { return input }\n', {})).body[0]
  const param = declaration.params[0]

  assert.equal(declaration.returnTypeRef, null)
  assert.equal(declaration.returnNullable, false)
  assert.equal(declaration.returnArrayElementType, null)
  assert.equal(declaration.returnArrayElementDeclaredType, null)
  assert.equal(declaration.returnMapKeyType, null)
  assert.equal(declaration.returnMapValueType, null)
  assert.equal(declaration.returnPromiseValueType, null)
  assert.equal(declaration.returnShape, null)
  assert.equal(param.declaredType, null)
  assert.equal(param.typeRef, null)
  assert.equal(param.nullable, false)
  assert.equal(param.arrayElementType, null)
  assert.equal(param.mapValueShape, null)
  assert.equal(param.promiseValueType, null)
  assert.equal(param.functionType, null)
  assert.equal(param.shape, null)
  assert.equal(param.className, null)
  assert.equal(param.defaultValue, null)
  assert.equal(param.bindingElements, null)
})
