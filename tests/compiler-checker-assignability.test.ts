import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  commonArrayElementType,
  commonValueType,
  inferBinaryExpressionType,
  isAssignableType,
  isEqualityComparableType,
  isEqualityOperator,
  isMatchingSwitchCaseType,
  isSwitchableType
} from '../src/compiler/checker/assignability.ts'

test('classifies binary and equality expression types', () => {
  assert.equal(inferBinaryExpressionType('+', 'number', 'number'), 'number')
  assert.equal(inferBinaryExpressionType('+', 'string', 'number'), 'string')
  assert.equal(inferBinaryExpressionType('===', 'number', 'number'), 'boolean')
  assert.equal(inferBinaryExpressionType('??', 'null', 'string'), 'string')
  assert.equal(inferBinaryExpressionType('??', 'number', 'string'), 'number')
  assert.equal(isEqualityOperator('!='), true)
  assert.equal(isEqualityOperator('<'), false)
  assert.equal(isEqualityComparableType('string', 'string'), true)
  assert.equal(isEqualityComparableType('string', 'number'), false)
  assert.equal(isEqualityComparableType('unknown', 'number'), true)
})

test('checks assignment compatibility with nullable values', () => {
  assert.equal(isAssignableType('number', 'number'), true)
  assert.equal(isAssignableType('number', 'string'), false)
  assert.equal(isAssignableType('unknown', 'string'), true)
  assert.equal(isAssignableType('null', 'string'), false)
  assert.equal(isAssignableType('null', 'string', true), true)
  assert.equal(isAssignableType('string', 'string', false, true), false)
  assert.equal(isAssignableType('string', 'string', true, true), true)
})

test('checks switch and common value helpers', () => {
  assert.equal(isSwitchableType('string'), true)
  assert.equal(isSwitchableType('object'), false)
  assert.equal(isMatchingSwitchCaseType('unknown', 'number'), true)
  assert.equal(isMatchingSwitchCaseType('string', 'number'), false)
  assert.equal(commonValueType(['number', 'number']), 'number')
  assert.equal(commonValueType(['number', 'string']), 'unknown')
  assert.equal(commonValueType([]), 'unknown')
  assert.equal(commonArrayElementType(['boolean', 'boolean']), 'boolean')
})
