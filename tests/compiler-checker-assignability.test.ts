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
  assert.equal(isAssignableType('array', 'union<AnyNode,array<AnyNode>>'), true)
  assert.equal(isAssignableType('object', 'union<AnyNode,array<AnyNode>>'), true)
  assert.equal(isAssignableType('string', 'union<AnyNode,array<AnyNode>>'), false)
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
      error.diagnostics.some((item: any) => item.code === 'INOX_TYPE_MISMATCH')
  )
})

test('merges nullable local narrowing from both if branches', () => {
  assert.doesNotThrow(() => {
    compileSource(
      `type Info = {
  method: string
}

function maybe(): Info | null {
  return { method: 'read' }
}

function read(flag: boolean): string {
  let info = maybe()

  if (flag) {
    if (info == null) {
      return ''
    }
  } else {
    info = maybe()
    if (info == null) {
      return ''
    }
  }

  return info.method
}
`,
      { target: 'c' }
    )
  })
})

test('does not leak block-local nullable narrowing into shadowed outer locals', () => {
  assert.throws(
    () => {
      compileSource(
        `type Info = {
  method: string
}

function maybe(): Info | null {
  return { method: 'read' }
}

function read(flag: boolean): string {
  let info: Info | null = null

  if (flag) {
    let info = maybe()
    if (info == null) {
      return ''
    }
  } else {
    let info = maybe()
    if (info == null) {
      return ''
    }
  }

  return info.method
}
`,
        { target: 'c' }
      )
    },
    (error: any) =>
      Array.isArray(error?.diagnostics) &&
      error.diagnostics.some((item: any) => item.code === 'INOX_WEAK_ACCESS')
  )
})

test('does not narrow nullable locals after conditional assignment without else', () => {
  assert.throws(
    () => {
      compileSource(
        `type Info = {
  method: string
}

function maybe(): Info | null {
  return { method: 'read' }
}

function read(flag: boolean): string {
  let info: Info | null = null

  if (flag) {
    info = maybe()
  }

  return info.method
}
`,
        { target: 'c' }
      )
    },
    (error: any) =>
      Array.isArray(error?.diagnostics) &&
      error.diagnostics.some((item: any) => item.code === 'INOX_WEAK_ACCESS')
  )
})

test('narrows nullable member paths after non-null assignments', () => {
  assert.doesNotThrow(() => {
    compileSource(
      `type Info = {
  method: string
}

type Holder = {
  info?: Info
}

function read(holder: Holder): string {
  holder.info = { method: 'read' }
  return holder.info.method
}
`,
      { target: 'c' }
    )
  })
})

test('does not narrow nullable member paths after nullable assignments', () => {
  assert.throws(
    () => {
      compileSource(
        `type Info = {
  method: string
}

type Holder = {
  info?: Info
}

function maybe(): Info | null {
  return null
}

function read(holder: Holder): string {
  holder.info = maybe()
  return holder.info.method
}
`,
        { target: 'c' }
      )
    },
    (error: any) =>
      Array.isArray(error?.diagnostics) &&
      error.diagnostics.some((item: any) => item.code === 'INOX_WEAK_ACCESS')
  )
})
