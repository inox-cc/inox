import type { ValueType } from '../types.ts'

type ValueTypeList = ValueType[]

export function inferBinaryExpressionType(operator: string, left: ValueType, right: ValueType): ValueType {
  if (
    operator === '===' ||
    operator === '!==' ||
    operator === '==' ||
    operator === '!=' ||
    operator === '<' ||
    operator === '<=' ||
    operator === '>' ||
    operator === '>=' ||
    operator === '&&' ||
    operator === '||'
  ) {
    return 'boolean'
  }

  if (operator === '??') {
    if (left === 'null' || left === 'unknown') {
      return right
    }

    return left
  }

  if (operator === '+' && (left === 'string' || right === 'string')) {
    return 'string'
  }

  return 'number'
}

export function isEqualityOperator(operator: string): boolean {
  return operator === '===' || operator === '!==' || operator === '==' || operator === '!='
}

export function isEqualityComparableType(left: ValueType, right: ValueType): boolean {
  if (left === 'unknown' || right === 'unknown') {
    return true
  }

  return (
    (
      left === 'boolean' ||
      left === 'number' ||
      left === 'string' ||
      left === 'null' ||
      left === 'object' ||
      left === 'array' ||
      left === 'bytes' ||
      left === 'map' ||
      left === 'set'
    ) &&
    left === right
  )
}

export function isAssignableType(
  actual: ValueType | null | undefined,
  expected: ValueType | null | undefined,
  expectedNullable?: boolean,
  actualNullable?: boolean
): boolean {
  const expectedAllowsNull = expectedNullable === true
  const actualCanBeNull = actualNullable === true

  if (actual == null || expected == null || actual === 'unknown' || expected === 'unknown') {
    return true
  }

  if (actualCanBeNull && actual !== 'null' && !expectedAllowsNull) {
    return false
  }

  if (actual === 'null') {
    return expected === 'null' || expectedAllowsNull
  }

  return actual === expected
}

export function isSwitchableType(valueType: ValueType): boolean {
  return valueType === 'boolean' || valueType === 'number' || valueType === 'string' || valueType === 'unknown'
}

export function isMatchingSwitchCaseType(actual: ValueType, expected: ValueType): boolean {
  return actual === 'unknown' || expected === 'unknown' || actual === expected
}

export function commonArrayElementType(types: ValueTypeList): ValueType {
  return commonValueType(types)
}

export function commonValueType(types: ValueTypeList): ValueType {
  if (types.length === 0) {
    return 'unknown'
  }

  const first = types[0]

  for (const valueType of types) {
    if (valueType !== first) {
      return 'unknown'
    }
  }

  return first
}
