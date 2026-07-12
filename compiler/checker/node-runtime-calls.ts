import { diagnostic } from '../diagnostics.ts'
import type { AnyNode, Diagnostic, ObjectShapeInfo, SourceLocation, ValueType } from '../types.ts'
import { isAssignableType } from './assignability.ts'
import type { CheckedCallArgInfo } from './global-calls.ts'

type ProcessRuntimeCall = {
  arrayElementType?: ValueType | null
  label: string
  method: string
  shape?: ObjectShapeInfo | null
  unsupported?: boolean
  valueType: ValueType
}


export type NodeRuntimeCallCheckerContext = {
  diagnostics: Diagnostic[]
}

function report(context: NodeRuntimeCallCheckerContext, code: string, message: string, loc: SourceLocation): void {
  context.diagnostics.push(diagnostic(code, message, loc))
}

function checkAssignableType(
  context: NodeRuntimeCallCheckerContext,
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

export function checkProcessCall(
  context: NodeRuntimeCallCheckerContext,
  expression: AnyNode,
  call: ProcessRuntimeCall,
  argInfos: CheckedCallArgInfo[]
): ValueType {
  if (call.unsupported) {
    report(
      context,
      'INOX_NOT_IMPLEMENTED',
      `node:process ${call.method} is not implemented by the current C backend`,
      expression.loc
    )
    expression.valueType = 'unknown'
    return 'unknown'
  }

  expression.processRuntimeMethod = call.method

  if (call.method === 'cwd' || call.method === 'memoryUsage') {
    if (expression.args.length !== 0) {
      report(
        context,
        'INOX_ARG_COUNT',
        `function ${call.label} expects 0 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    expression.valueType = call.valueType
    expression.shape = call.shape ?? null
    return expression.valueType
  }

  if (call.method === 'hrtime') {
    if (expression.args.length > 1) {
      report(
        context,
        'INOX_ARG_COUNT',
        `function ${call.label} expects 0 or 1 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    if (argInfos.length > 0) {
      const firstArg = argInfos[0]

      checkAssignableType(context, firstArg.valueType, 'array', firstArg.loc, false, false)
    }

    expression.valueType = call.valueType
    expression.arrayElementType = call.arrayElementType ?? null
    return expression.valueType
  }

  if (expression.args.length > 1) {
    report(
      context,
      'INOX_ARG_COUNT',
      `function ${call.label} expects 0 or 1 argument(s), got ${expression.args.length}`,
      expression.loc
    )
  }

  if (argInfos.length > 0) {
    const firstArg = argInfos[0]

    checkAssignableType(context, firstArg.valueType, 'number', firstArg.loc, false, false)
  }

  expression.valueType = 'void'
  return 'void'
}
