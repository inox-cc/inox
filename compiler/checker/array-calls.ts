import { diagnostic } from '../diagnostics.ts'
import type { AnyNode, Diagnostic, SourceLocation, ValueType } from '../types.ts'
import { isAssignableType } from './assignability.ts'

export type CheckedArrayArgInfo = {
  loc: SourceLocation
  nullable: boolean
  valueType: ValueType
}

export type CheckedArrayCallInfo = {
  argCount: number
  args: CheckedArrayArgInfo[]
  elementType: ValueType
}

export type ArrayCallCheckerContext = {
  diagnostics: Diagnostic[]
}

function report(context: ArrayCallCheckerContext, code: string, message: string, loc: SourceLocation): void {
  context.diagnostics.push(diagnostic(code, message, loc))
}

function checkAssignableType(
  context: ArrayCallCheckerContext,
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

export function isSimpleArrayMethod(method: string): boolean {
  return (
    method === 'push' ||
    method === 'unshift' ||
    method === 'pop' ||
    method === 'join' ||
    method === 'includes' ||
    method === 'slice'
  )
}

export function checkSimpleArrayMethodCall(
  context: ArrayCallCheckerContext,
  expression: AnyNode,
  method: string,
  info: CheckedArrayCallInfo
): ValueType | null {
  if (method === 'push' || method === 'unshift') {
    expression.valueType = 'number'

    if (info.argCount !== 1) {
      report(context, 'INOX_ARG_COUNT', `array.${method} expects 1 argument(s), got ${info.argCount}`, expression.loc)
    }

    checkElementAssignable(context, info, 0)

    return 'number'
  }

  if (method === 'pop') {
    expression.valueType = info.elementType
    expression.nullable = true

    if (info.argCount !== 0) {
      report(context, 'INOX_ARG_COUNT', `array.pop expects 0 argument(s), got ${info.argCount}`, expression.loc)
    }

    return info.elementType
  }

  if (method === 'join') {
    expression.valueType = 'string'

    if (info.argCount > 1) {
      report(context, 'INOX_ARG_COUNT', `array.join expects 0 or 1 argument(s), got ${info.argCount}`, expression.loc)
    }

    checkIndexedArgAssignable(context, info, 0, 'string', true)

    return 'string'
  }

  if (method === 'includes') {
    expression.valueType = 'boolean'

    if (info.argCount !== 1) {
      report(context, 'INOX_ARG_COUNT', `array.includes expects 1 argument(s), got ${info.argCount}`, expression.loc)
    }

    if (info.elementType !== 'unknown') {
      checkElementAssignable(context, info, 0)
    }

    return 'boolean'
  }

  if (method === 'slice') {
    expression.valueType = 'array'

    if (info.argCount > 2) {
      report(
        context,
        'INOX_ARG_COUNT',
        `array.slice expects 0, 1 or 2 argument(s), got ${info.argCount}`,
        expression.loc
      )
    }

    for (const arg of info.args) {
      checkAssignableType(context, arg.valueType, 'number', arg.loc, false, false)
    }

    return 'array'
  }

  return null
}

function checkElementAssignable(context: ArrayCallCheckerContext, info: CheckedArrayCallInfo, index: number): void {
  checkIndexedArgAssignable(context, info, index, info.elementType, true)
}

function checkIndexedArgAssignable(
  context: ArrayCallCheckerContext,
  info: CheckedArrayCallInfo,
  index: number,
  expected: ValueType,
  nullable: boolean
): void {
  if (index >= info.args.length) {
    return
  }

  const arg = info.args[index]

  checkAssignableType(context, arg.valueType, expected, arg.loc, false, nullable ? arg.nullable : false)
}
