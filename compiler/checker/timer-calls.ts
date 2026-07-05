import { timerCallbackFunctionType, timerClearMethodName } from '../stdlib/node/checker.ts'
import { diagnostic } from '../diagnostics.ts'
import type { AnyNode, Diagnostic, SourceLocation, ValueType } from '../types.ts'
import { isAssignableType } from './assignability.ts'

export type CheckedTimerArgInfo = {
  valueType: ValueType
  loc: SourceLocation
}

export type CheckedTimerCallbackInfo = {
  async: boolean
  kind: 'arrow' | 'missing' | 'reference'
  loc: SourceLocation
  paramsLength: number | null
  returnNullable: boolean
  returnType: ValueType | null
  valueType: ValueType | null
}

export type CheckedTimerCallInfo = {
  argCount: number
  callback: CheckedTimerCallbackInfo
  firstArg: CheckedTimerArgInfo | null
  delayArg: CheckedTimerArgInfo | null
}

export type TimerCallCheckerContext = {
  diagnostics: Diagnostic[]
}

function report(context: TimerCallCheckerContext, code: string, message: string, loc: SourceLocation): void {
  context.diagnostics.push(diagnostic(code, message, loc))
}

function checkAssignableType(
  context: TimerCallCheckerContext,
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

export function checkTimerCall(
  context: TimerCallCheckerContext,
  expression: AnyNode,
  method: string,
  info: CheckedTimerCallInfo
): ValueType {
  expression.timerRuntimeMethod = method

  if (timerClearMethodName(method)) {
    if (info.argCount !== 1) {
      report(
        context,
        'INOX_ARG_COUNT',
        `function ${method} expects 1 argument(s), got ${info.argCount}`,
        expression.loc
      )
    }

    if (info.firstArg !== null) {
      checkAssignableType(context, info.firstArg.valueType, 'timer', info.firstArg.loc, false, false)
    }

    expression.valueType = 'void'

    return 'void'
  }

  if (method === 'setImmediate') {
    if (info.argCount !== 1) {
      report(
        context,
        'INOX_ARG_COUNT',
        `function setImmediate expects 1 argument(s), got ${info.argCount}`,
        expression.loc
      )
    }

    checkTimerCallbackArg(context, info.callback)
    expression.valueType = 'timer'

    return 'timer'
  }

  if (info.argCount !== 2) {
    report(
      context,
      'INOX_ARG_COUNT',
      `function ${method} expects 2 argument(s), got ${info.argCount}`,
      expression.loc
    )
  }

  checkTimerCallbackArg(context, info.callback)

  if (info.delayArg !== null) {
    checkAssignableType(context, info.delayArg.valueType, 'number', info.delayArg.loc, false, false)
  }

  expression.valueType = 'timer'

  return 'timer'
}

function checkTimerCallbackArg(context: TimerCallCheckerContext, info: CheckedTimerCallbackInfo): void {
  const functionType = timerCallbackFunctionType()

  if (info.kind === 'missing') {
    return
  }

  if (info.kind === 'arrow') {
    if (info.async) {
      report(
        context,
        'INOX_ASYNC_TIMER_CALLBACK',
        'async timer callbacks are not supported in the MVP; use a synchronous timer callback and handle Promise work explicitly',
        info.loc
      )
    }
    return
  }

  checkAssignableType(context, info.valueType, 'function', info.loc, false, false)

  if (info.paramsLength !== null && info.paramsLength !== functionType.params.length) {
    report(
      context,
      'INOX_ARG_COUNT',
      `function callback expects ${functionType.params.length} argument(s), got ${info.paramsLength}`,
      info.loc
    )
  }

  if (info.async) {
    report(
      context,
      'INOX_ASYNC_TIMER_CALLBACK',
      'async timer callbacks are not supported in the MVP; use a synchronous timer callback and handle Promise work explicitly',
      info.loc
    )
    return
  }

  if (info.returnType !== null) {
    checkAssignableType(
      context,
      info.returnType,
      functionType.returnType,
      info.loc,
      functionType.returnNullable === true,
      info.returnNullable
    )
  }
}
