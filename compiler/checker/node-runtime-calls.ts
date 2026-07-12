import { diagnostic } from '../diagnostics.ts'
import type { AnyNode, Diagnostic, ObjectShapeInfo, SourceLocation, ValueType } from '../types.ts'
import { isAssignableType } from './assignability.ts'
import { urlObjectShape } from './builtins.ts'
import type { CheckedCallArgInfo } from './global-calls.ts'

type ProcessRuntimeCall = {
  arrayElementType?: ValueType | null
  label: string
  method: string
  shape?: ObjectShapeInfo | null
  unsupported?: boolean
  valueType: ValueType
}

type UrlRuntimeCall = {
  label: string
  method: string
  unsupported?: boolean
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

export function checkUrlCall(
  context: NodeRuntimeCallCheckerContext,
  expression: AnyNode,
  call: UrlRuntimeCall,
  argInfos: CheckedCallArgInfo[]
): ValueType {
  if (call.unsupported) {
    report(
      context,
      'INOX_NOT_IMPLEMENTED',
      `node:url ${call.method} is not implemented by the current C backend`,
      expression.loc
    )
    expression.valueType = 'unknown'
    return 'unknown'
  }

  checkExactArgCount(context, expression, call.label, 1)

  if (argInfos.length > 0) {
    const firstArg = argInfos[0]

    if (call.method === 'fileURLToPath') {
      let isUrlObject = false

      if (firstArg.shape !== null && typeof firstArg.shape !== 'undefined' && firstArg.shape.builtin === 'url.URL') {
        isUrlObject = true
      }

      if (firstArg.valueType !== 'string' && !(firstArg.valueType === 'object' && isUrlObject)) {
        report(
          context,
          'INOX_TYPE_MISMATCH',
          `function ${call.label} expects string or URL, got ${firstArg.valueType}`,
          firstArg.loc
        )
      }
    } else {
      checkAssignableType(context, firstArg.valueType, 'string', firstArg.loc, false, firstArg.nullable)
    }
  }

  expression.urlRuntimeMethod = call.method

  if (call.method === 'pathToFileURL') {
    expression.valueType = 'object'
    expression.shape = urlObjectShape
    return 'object'
  }

  expression.valueType = 'string'
  return 'string'
}

export function checkUrlSearchParamsMethodCall(
  context: NodeRuntimeCallCheckerContext,
  expression: AnyNode,
  method: string,
  argInfos: CheckedCallArgInfo[]
): ValueType {
  let expectedArgs = 1

  if (method === 'set' || method === 'append') {
    expectedArgs = 2
  } else if (method === 'toString') {
    expectedArgs = 0
  }

  if (expression.args.length !== expectedArgs) {
    report(
      context,
      'INOX_ARG_COUNT',
      `function URLSearchParams.${method} expects ${expectedArgs} argument(s), got ${expression.args.length}`,
      expression.loc
    )
  }

  checkStringArgs(context, argInfos)
  expression.urlRuntimeMethod = `URLSearchParams.${method}`

  if (method === 'has') {
    expression.valueType = 'boolean'
    return 'boolean'
  }

  if (method === 'append' || method === 'delete' || method === 'set') {
    expression.valueType = 'void'
    return 'void'
  }

  expression.valueType = 'string'
  expression.nullable = method === 'get'

  return 'string'
}

function checkExactArgCount(
  context: NodeRuntimeCallCheckerContext,
  expression: AnyNode,
  label: string,
  expected: number
): void {
  if (expression.args.length === expected) {
    return
  }

  report(
    context,
    'INOX_ARG_COUNT',
    `function ${label} expects ${expected} argument(s), got ${expression.args.length}`,
    expression.loc
  )
}

function checkStringArgs(context: NodeRuntimeCallCheckerContext, argInfos: CheckedCallArgInfo[]): void {
  for (let index = 0; index < argInfos.length; index = index + 1) {
    const argInfo = argInfos[index]

    checkAssignableType(context, argInfo.valueType, 'string', argInfo.loc, false, argInfo.nullable)
  }
}
