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
import { compileSource } from '../src/compiler/index.ts'

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

test('allows JavaScript null equality checks on non-nullable values', () => {
  assert.doesNotThrow(() => {
    compileSource(
      `export function main(): void {
  const name = 'Ada'
  if (name != null) {
    console.log(name)
  }
}
`,
      { target: 'c' }
    )
  })
})

test('narrows nullable object fields checked through member paths', () => {
  assert.doesNotThrow(() => {
    compileSource(
      `type Shape = {
  id: number
}

type Holder = {
  shape?: Shape
}

function read(holder: Holder | null): number {
  if (holder != null && holder.shape != null) {
    return holder.shape.id
  }

  return 0
}

export function main(): void {
  console.log(read({ shape: { id: 7 } }))
}
`,
      { target: 'c' }
    )
  })
})

test('clears member-path narrowing after base assignment', () => {
  assert.throws(
    () => {
      compileSource(
        `type Shape = {
  id: number
}

type Holder = {
  shape?: Shape
}

function read(holder: Holder | null, fallback: Holder): number {
  if (holder != null && holder.shape != null) {
    holder = fallback
    const shape: Shape = holder.shape
    return shape.id
  }

  return 0
}

export function main(): void {
  console.log(read({ shape: { id: 7 } }, {}))
}
`,
        { target: 'c' }
      )
    },
    (error: any) =>
      Array.isArray(error?.diagnostics) &&
      error.diagnostics.some((item: any) => item.code === 'CCJS_TYPE_MISMATCH')
  )
})
