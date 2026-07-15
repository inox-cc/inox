import { diagnostic } from '../diagnostics.ts'
import { memberExpressionPath } from '../member-paths.ts'
import type { TypeRef } from '../extensions/types.ts'
import type { AnyNode, Diagnostic, ObjectShapeInfo, SourceLocation, ValueType } from '../types.ts'
import { isAssignableType } from './assignability.ts'
import { objectValuesElementTypeFromShape } from './expression-helpers.ts'

export type GlobalCallCheckerContext = {
  diagnostics: Diagnostic[]
}

export type CheckedCallArgInfo = {
  valueType: ValueType
  nullable: boolean
  loc: SourceLocation
  arrayElementType: ValueType | null
  shape: ObjectShapeInfo | null
  typeRef: TypeRef
}

function report(context: GlobalCallCheckerContext, code: string, message: string, loc: SourceLocation): void {
  context.diagnostics.push(diagnostic(code, message, loc))
}

function checkAssignableType(
  context: GlobalCallCheckerContext,
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

export function checkArrayIsArrayCall(
  context: GlobalCallCheckerContext,
  expression: AnyNode,
  arrayShadowed: boolean
): ValueType | null {
  const path = memberExpressionPath(expression.callee)

  if (
    path === null ||
    typeof path === 'undefined' ||
    path.length !== 2 ||
    path[0] !== 'Array' ||
    path[1] !== 'isArray' ||
    arrayShadowed
  ) {
    return null
  }

  expression.arrayIsArrayCall = true
  expression.valueType = 'boolean'

  if (expression.args.length !== 1) {
    report(
      context,
      'INOX_ARG_COUNT',
      `function Array.isArray expects 1 argument(s), got ${expression.args.length}`,
      expression.loc
    )
  }

  return 'boolean'
}

export function isObjectStaticCall(expression: AnyNode, objectShadowed: boolean): boolean {
  const path = memberExpressionPath(expression.callee)

  return (
    path !== null &&
    typeof path !== 'undefined' &&
    path.length === 2 &&
    path[0] === 'Object' &&
    (path[1] === 'values' || path[1] === 'entries' || path[1] === 'keys') &&
    !objectShadowed
  )
}

export function checkObjectStaticCall(
  context: GlobalCallCheckerContext,
  expression: AnyNode,
  argInfos: CheckedCallArgInfo[]
): ValueType {
  const path = memberExpressionPath(expression.callee)
  const method = path[1]

  expression.objectRuntimeMethod = method
  expression.valueType = 'array'
  expression.arrayElementType = 'unknown'
  expression.arrayElementDeclaredType = null

  if (method === 'entries') {
    expression.arrayElementType = 'array'
  } else if (method === 'keys') {
    expression.arrayElementType = 'string'
    expression.arrayElementDeclaredType = 'string'
  }

  if (expression.args.length !== 1) {
    report(
      context,
      'INOX_ARG_COUNT',
      `function Object.${method} expects 1 argument(s), got ${expression.args.length}`,
      expression.loc
    )
  }

  if (argInfos.length > 0) {
    const firstArg = argInfos[0]

    if (firstArg.valueType !== 'unknown' && firstArg.valueType !== 'object' && firstArg.valueType !== 'array') {
      report(context, 'INOX_TYPE_MISMATCH', `function Object.${method} expects an object or array argument`, firstArg.loc)
    }

    if (method === 'values') {
      if (firstArg.valueType === 'array') {
        expression.arrayElementType = firstArg.arrayElementType ?? 'unknown'
      } else {
        expression.arrayElementType = objectValuesElementTypeFromShape(firstArg.shape)
      }
    }
  }

  return 'array'
}
