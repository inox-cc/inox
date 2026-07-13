import {
  mapRuntimeMethodName,
  setRuntimeMethodName
} from '../../stdlib/global/compiler/descriptor.ts'
import { diagnostic } from '../diagnostics.ts'
import type { AnyNode, Diagnostic, ObjectShapeInfo, SourceLocation, ValueType } from '../types.ts'
import { isAssignableType } from './assignability.ts'
import type { CheckerMapType } from './resolved-types.ts'
import { resolvedConcreteValueTypeMetadata } from './resolved-types.ts'

export type CheckedCollectionArgInfo = {
  loc: SourceLocation
  nullable: boolean
  valueType: ValueType
}

export type CheckedCollectionCallInfo = {
  argCount: number
  args: CheckedCollectionArgInfo[]
  mapType: CheckerMapType | null
  objectType: ValueType
  setElementType: ValueType
}

export type CollectionCallCheckerContext = {
  diagnostics: Diagnostic[]
}

function report(context: CollectionCallCheckerContext, code: string, message: string, loc: SourceLocation): void {
  context.diagnostics.push(diagnostic(code, message, loc))
}

function checkAssignableType(
  context: CollectionCallCheckerContext,
  actual: ValueType | null | undefined,
  expected: ValueType | null | undefined,
  loc: SourceLocation,
  expectedNullable?: boolean,
  actualNullable?: boolean
): void {
  const expectedAllowsNull = expectedNullable === true
  const actualCanBeNull = actualNullable === true

  if (isAssignableType(actual, expected, expectedAllowsNull, actualCanBeNull)) {
    return
  }

  let actualLabel = actual

  if (
    actualCanBeNull &&
    actual !== 'null' &&
    actual !== 'unknown' &&
    actual !== null &&
    typeof actual !== 'undefined'
  ) {
    actualLabel = `${actual} | null`
  }

  report(context, 'INOX_TYPE_MISMATCH', `cannot assign ${actualLabel} to ${expected}`, loc)
}

export function checkCollectionMethodCall(
  context: CollectionCallCheckerContext,
  expression: AnyNode,
  property: string,
  info: CheckedCollectionCallInfo
): ValueType | null {
  const mapMethod = mapRuntimeMethodName(property)

  if (info.objectType === 'map' && mapMethod !== null && typeof mapMethod !== 'undefined') {
    return checkMapMethodCall(context, expression, mapMethod, info)
  }

  const setMethod = setRuntimeMethodName(property)

  if (info.objectType === 'set' && setMethod !== null && typeof setMethod !== 'undefined') {
    return checkSetMethodCall(context, expression, setMethod, info)
  }

  return null
}

export function isCollectionMethodCandidate(objectType: ValueType, property: string): boolean {
  if (objectType === 'map') {
    const mapMethod = mapRuntimeMethodName(property)

    return mapMethod !== null && typeof mapMethod !== 'undefined'
  }

  if (objectType === 'set') {
    const setMethod = setRuntimeMethodName(property)

    return setMethod !== null && typeof setMethod !== 'undefined'
  }

  return false
}

function checkMapMethodCall(
  context: CollectionCallCheckerContext,
  expression: AnyNode,
  mapMethod: string,
  info: CheckedCollectionCallInfo
): ValueType {
  let mapKeyType: ValueType = 'unknown'
  let mapRawValueType: ValueType = 'unknown'

  if (info.mapType !== null && typeof info.mapType !== 'undefined') {
    if (info.mapType.key !== null && typeof info.mapType.key !== 'undefined') {
      mapKeyType = info.mapType.key
    }

    if (info.mapType.value !== null && typeof info.mapType.value !== 'undefined') {
      mapRawValueType = info.mapType.value
    }
  }

  const mapValueType = resolvedConcreteValueTypeMetadata(mapRawValueType, 'unknown')

  if (mapMethod === 'clear') {
    checkCollectionArgCount(context, expression, 'map.clear', 0, info.argCount)
    expression.valueType = 'void'
    return 'void'
  }

  if (mapMethod === 'get' || mapMethod === 'has' || mapMethod === 'delete') {
    checkCollectionArgCount(context, expression, `map.${mapMethod}`, 1, info.argCount)
    checkIndexedArgAssignable(context, info, 0, mapKeyType)

    if (mapMethod === 'get') {
      expression.valueType = mapValueType
      expression.nullable = true
      expression.shape = mapValueShape(info.mapType)
      expression.arrayElementType = info.mapType?.valueArrayElementType ?? null
      expression.arrayElementDeclaredType = info.mapType?.valueArrayElementDeclaredType ?? null
      return mapValueType
    }

    expression.valueType = 'boolean'
    return 'boolean'
  }

  checkCollectionArgCount(context, expression, 'map.set', 2, info.argCount)
  checkIndexedArgAssignable(context, info, 0, mapKeyType)
  checkIndexedArgAssignable(context, info, 1, mapRawValueType)

  expression.valueType = 'map'
  expression.mapKeyType = mapKeyType
  expression.mapValueType = mapRawValueType

  return 'map'
}

function checkSetMethodCall(
  context: CollectionCallCheckerContext,
  expression: AnyNode,
  setMethod: string,
  info: CheckedCollectionCallInfo
): ValueType {
  if (setMethod === 'clear') {
    checkCollectionArgCount(context, expression, 'set.clear', 0, info.argCount)
    expression.valueType = 'void'
    return 'void'
  }

  checkCollectionArgCount(context, expression, `set.${setMethod}`, 1, info.argCount)
  checkIndexedArgAssignable(context, info, 0, info.setElementType)

  if (setMethod === 'add') {
    expression.valueType = 'set'
    expression.setElementType = info.setElementType
    return 'set'
  }

  expression.valueType = 'boolean'
  return 'boolean'
}

function checkCollectionArgCount(
  context: CollectionCallCheckerContext,
  expression: AnyNode,
  name: string,
  expected: number,
  actual: number
): void {
  if (actual === expected) {
    return
  }

  report(
    context,
    'INOX_ARG_COUNT',
    `${name} expects ${expected} argument(s), got ${actual}`,
    expression.loc
  )
}

function checkIndexedArgAssignable(
  context: CollectionCallCheckerContext,
  info: CheckedCollectionCallInfo,
  index: number,
  expected: ValueType
): void {
  if (index >= info.args.length) {
    return
  }

  const arg = info.args[index]

  checkAssignableType(context, arg.valueType, expected, arg.loc, false, arg.nullable)
}

function mapValueShape(mapType: CheckerMapType | null): ObjectShapeInfo | null {
  if (mapType === null || typeof mapType === 'undefined') {
    return null
  }

  return mapType.valueShape ?? null
}
