import { diagnostic } from '../diagnostics.ts'
import type { AnyNode, Diagnostic, SourceLocation, ValueType } from '../types.ts'
import { isAssignableType } from './assignability.ts'
import type { CheckedCallArgInfo } from './global-calls.ts'

type DateInstanceRuntimeMethodInfo = {
  method: string
  returnType: ValueType
}

type TimeRuntimeCallInfo = {
  member: string
  method: string
  root: string
}

export type TimeCallCheckerContext = {
  diagnostics: Diagnostic[]
}

function report(context: TimeCallCheckerContext, code: string, message: string, loc: SourceLocation): void {
  context.diagnostics.push(diagnostic(code, message, loc))
}

function checkAssignableType(
  context: TimeCallCheckerContext,
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

export function checkTimeCall(
  context: TimeCallCheckerContext,
  expression: AnyNode,
  call: TimeRuntimeCallInfo,
  argInfos: CheckedCallArgInfo[]
): ValueType {
  const method = call.method
  expression.valueType = 'number'

  if (method === 'dateParse') {
    if (expression.args.length !== 1) {
      report(
        context,
        'INOX_ARG_COUNT',
        `function ${call.root}.${call.member} expects 1 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    if (argInfos.length > 0) {
      const firstArg = argInfos[0]

      checkAssignableType(context, firstArg.valueType, 'string', firstArg.loc, false, firstArg.nullable)
    }

    expression.timeRuntimeMethod = method
    return 'number'
  }

  if (method === 'dateUTC') {
    if (expression.args.length < 2 || expression.args.length > 7) {
      report(
        context,
        'INOX_ARG_COUNT',
        `function ${call.root}.${call.member} expects 2 to 7 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    for (let index = 0; index < argInfos.length; index = index + 1) {
      const argInfo = argInfos[index]

      checkAssignableType(context, argInfo.valueType, 'number', argInfo.loc, false, false)
    }

    expression.timeRuntimeMethod = method
    return 'number'
  }

  if (expression.args.length !== 0) {
    report(
      context,
      'INOX_ARG_COUNT',
      `function ${call.root}.${call.member} expects 0 argument(s), got ${expression.args.length}`,
      expression.loc
    )
  }

  expression.timeRuntimeMethod = method
  return 'number'
}

export function checkDateInstanceMethodCall(
  context: TimeCallCheckerContext,
  expression: AnyNode,
  info: DateInstanceRuntimeMethodInfo,
  _argInfos: CheckedCallArgInfo[]
): ValueType {
  if (expression.args.length !== 0) {
    report(
      context,
      'INOX_ARG_COUNT',
      `function Date.${info.method} expects 0 argument(s), got ${expression.args.length}`,
      expression.loc
    )
  }

  expression.timeRuntimeMethod = info.method
  expression.valueType = info.returnType

  return info.returnType
}

export function checkDateConstructorExpression(
  context: TimeCallCheckerContext,
  expression: AnyNode,
  argTypes: ValueType[]
): ValueType {
  if (expression.args.length > 7) {
    report(
      context,
      'INOX_ARG_COUNT',
      `Date constructor expects 0 to 7 argument(s), got ${expression.args.length}`,
      expression.loc
    )
  }

  if (expression.args.length === 1) {
    const argType = argTypes[0]

    if (argType !== 'unknown' && argType !== 'number' && argType !== 'string' && argType !== 'date') {
      report(
        context,
        'INOX_TYPE_MISMATCH',
        `Date constructor expects number, string or Date, got ${argType}`,
        expression.args[0].loc
      )
    }
  } else if (expression.args.length > 1) {
    for (let index = 0; index < expression.args.length; index = index + 1) {
      checkAssignableType(context, argTypes[index], 'number', expression.args[index].loc, false, false)
    }
  }

  expression.timeRuntimeMethod = 'dateConstructor'
  expression.valueType = 'date'

  return 'date'
}
