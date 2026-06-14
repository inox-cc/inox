import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  emitArrowFunctionParams,
  emitArrowReturnTypeAnnotation,
  emitFunctionParams,
  emitReturnTypeAnnotation,
  emitTypeAlias,
  emitVariableTypeAnnotation
} from '../src/compiler/js/types.ts'
import type { AnyNode } from '../src/compiler/types.ts'

test('emits JS function and arrow parameter lists', () => {
  const params: AnyNode[] = [{ name: 'left' }, { name: 'right' }]

  assert.equal(emitFunctionParams(params), 'left, right')
  assert.equal(emitArrowFunctionParams({ params: [{ name: 'value' }] }), 'value')
  assert.equal(emitArrowFunctionParams({ params }), '(left, right)')
})

test('keeps current JS type annotation helpers empty', () => {
  assert.equal(emitReturnTypeAnnotation({ returnType: 'number' }), '')
  assert.equal(emitArrowReturnTypeAnnotation({ returnType: 'number' }), '')
  assert.equal(emitVariableTypeAnnotation({ valueType: 'string' }), '')
  assert.deepEqual(emitTypeAlias({ name: 'Name' }), [])
})
