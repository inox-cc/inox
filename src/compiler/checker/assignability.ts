import type { ValueType } from '../types.ts'

export function inferBinaryExpressionType(operator: string, left: ValueType, right: ValueType): ValueType {
  if (['===', '!==', '==', '!=', '<', '<=', '>', '>=', '&&', '||'].includes(operator)) {
    return 'boolean'
  }

  if (operator === '??') {
    return left === 'null' || left === 'unknown' ? right : left
  }

  if (operator === '+' && (left === 'string' || right === 'string')) {
    return 'string'
  }

  return 'number'
}

export function isEqualityOperator(operator: string): boolean {
  return ['===', '!==', '==', '!='].includes(operator)
}

export function isEqualityComparableType(left: ValueType, right: ValueType): boolean {
  if (left === 'unknown' || right === 'unknown') {
    return true
  }

  return ['boolean', 'number', 'string', 'null'].includes(left) && left === right
}

export function isAssignableType(
  actual: ValueType | null | undefined,
  expected: ValueType | null | undefined,
  expectedNullable = false,
  actualNullable = false
): boolean {
  if (actual == null || expected == null || actual === 'unknown' || expected === 'unknown') {
    return true
  }

  if (actualNullable && actual !== 'null' && !expectedNullable) {
    return false
  }

  if (actual === 'null') {
    return expected === 'null' || expectedNullable
  }

  return actual === expected
}

export function isSwitchableType(type: ValueType): boolean {
  return ['boolean', 'number', 'string', 'unknown'].includes(type)
}

export function isMatchingSwitchCaseType(actual: ValueType, expected: ValueType): boolean {
  return actual === 'unknown' || expected === 'unknown' || actual === expected
}

export function commonArrayElementType(types: ValueType[]): ValueType {
  return commonValueType(types)
}

export function commonValueType(types: ValueType[]): ValueType {
  const [first] = types

  if (first == null) {
    return 'unknown'
  }

  return types.every((type) => type === first) ? first : 'unknown'
}
