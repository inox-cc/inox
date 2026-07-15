import {
  isArrayTypeName,
  isNullableTypeName,
  isPromiseTypeName,
  mapTypeNamesFromTypeName,
  nullableTypeNameFromKnownTypeName,
  unionTypeNamesFromTypeName
} from '../type-names.ts'
import type { ValueType } from '../types.ts'

type ValueTypeList = ValueType[]

export function inferBinaryExpressionType(operator: string, left: ValueType, right: ValueType): ValueType {
  if (
    operator === '===' ||
    operator === '!==' ||
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

    if (right === 'null' || right === 'unknown' || right === left) {
      return left
    }

    return 'unknown'
  }

  if (operator === '+' && (left === 'string' || right === 'string')) {
    return 'string'
  }

  return 'number'
}

export function isEqualityOperator(operator: string): boolean {
  return operator === '===' || operator === '!=='
}

export function isEqualityComparableType(left: ValueType, right: ValueType): boolean {
  if (left === 'unknown' || right === 'unknown') {
    return true
  }

  return (
    (left === 'boolean' ||
      left === 'number' ||
      left === 'string' ||
      left === 'null' ||
      left === 'object' ||
      left === 'array' ||
      left === 'bytes' ||
      left === 'map') &&
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

  if (
    actual === null ||
    typeof actual === 'undefined' ||
    expected === null ||
    typeof expected === 'undefined' ||
    actual === 'unknown' ||
    expected === 'unknown'
  ) {
    return true
  }

  if (isNullableTypeName(expected)) {
    return isAssignableType(actual, nullableTypeNameFromKnownTypeName(expected), true, actualCanBeNull)
  }

  if (isNullableTypeName(actual)) {
    return isAssignableType(nullableTypeNameFromKnownTypeName(actual), expected, expectedAllowsNull, true)
  }

  const expectedUnion = unionTypeNamesFromTypeName(expected)

  if (expectedUnion !== null && typeof expectedUnion !== 'undefined') {
    for (const expectedName of expectedUnion) {
      if (isAssignableType(actual, expectedName, expectedAllowsNull, actualCanBeNull)) {
        return true
      }
    }

    return false
  }

  const actualUnion = unionTypeNamesFromTypeName(actual)

  if (actualUnion !== null && typeof actualUnion !== 'undefined') {
    for (const actualName of actualUnion) {
      if (!isAssignableType(actualName, expected, expectedAllowsNull, actualCanBeNull)) {
        return false
      }
    }

    return true
  }

  const normalizedActual = assignabilityBaseType(actual)
  const normalizedExpected = assignabilityBaseType(expected)

  if (actualCanBeNull && actual !== 'null' && !expectedAllowsNull) {
    return false
  }

  if (normalizedActual === 'null') {
    return expected === 'null' || expectedAllowsNull
  }

  return normalizedActual === normalizedExpected
}

function assignabilityBaseType(valueType: ValueType): ValueType {
  if (valueType === 'AnyNode') {
    return 'object'
  }

  if (valueType === 'ValueType') {
    return 'string'
  }

  if (isArrayTypeName(valueType)) {
    return 'array'
  }

  if (mapTypeNamesFromTypeName(valueType)) {
    return 'map'
  }

  if (isPromiseTypeName(valueType)) {
    return 'promise'
  }

  return valueType
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
