import { diagnostic } from '../diagnostics.ts'
import type { AnyNode, Diagnostic, ObjectShapeInfo, SourceLocation, ValueType } from '../types.ts'
import { isAssignableType } from './assignability.ts'
import { pathParseObjectShape, urlObjectShape } from './builtins.ts'
import type { CheckedCallArgInfo } from './global-calls.ts'

type OsRuntimeCall = {
  label: string
  method: string
  unsupported?: boolean
}

type PathRuntimeCall = {
  label: string
  method: string
  unsupported?: boolean
}

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

export function checkOsCall(
  context: NodeRuntimeCallCheckerContext,
  expression: AnyNode,
  call: OsRuntimeCall
): ValueType {
  if (call.unsupported) {
    report(
      context,
      'INOX_NOT_IMPLEMENTED',
      `node:os ${call.method} is not implemented by the current C backend`,
      expression.loc
    )
    expression.valueType = 'unknown'
    return 'unknown'
  }

  if (expression.args.length !== 0) {
    report(
      context,
      'INOX_ARG_COUNT',
      `function ${call.label} expects 0 argument(s), got ${expression.args.length}`,
      expression.loc
    )
  }

  expression.osRuntimeMethod = call.method
  expression.valueType = 'string'

  return 'string'
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

    const firstArg = argInfos[0]

    if (firstArg !== null && typeof firstArg !== 'undefined') {
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

  const firstArg = argInfos[0]

  if (firstArg !== null && typeof firstArg !== 'undefined') {
    checkAssignableType(context, firstArg.valueType, 'number', firstArg.loc, false, false)
  }

  expression.valueType = 'void'
  return 'void'
}

export function checkPathCall(
  context: NodeRuntimeCallCheckerContext,
  expression: AnyNode,
  call: PathRuntimeCall,
  argInfos: CheckedCallArgInfo[]
): ValueType {
  if (call.unsupported) {
    report(
      context,
      'INOX_NOT_IMPLEMENTED',
      `node:path ${call.method} is not implemented by the current C backend`,
      expression.loc
    )
    expression.valueType = 'unknown'
    return 'unknown'
  }

  const method = call.method
  let returnType: ValueType = 'string'

  if (method === 'isAbsolute') {
    returnType = 'boolean'
  } else if (method === 'parse') {
    returnType = 'object'
  }

  expression.valueType = returnType
  expression.pathRuntimeMethod = method

  if (method === 'parse') {
    checkExactArgCount(context, expression, call.label, 1)
    checkStringArgs(context, argInfos)

    expression.shape = pathParseObjectShape
    return 'object'
  }

  if (method === 'format') {
    checkExactArgCount(context, expression, call.label, 1)

    const firstArg = argInfos[0]

    if (firstArg !== null && typeof firstArg !== 'undefined') {
      checkAssignableType(context, firstArg.valueType, 'object', firstArg.loc, false, firstArg.nullable)
    }

    return 'string'
  }

  if (method === 'join' || method === 'resolve') {
    checkStringArgs(context, argInfos)

    return returnType
  }

  if (method === 'basename') {
    if (expression.args.length < 1 || expression.args.length > 2) {
      report(
        context,
        'INOX_ARG_COUNT',
        `function ${call.label} expects 1 or 2 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    checkStringArgs(context, argInfos)

    return 'string'
  }

  let expectedArgs = 1

  if (method === 'relative') {
    expectedArgs = 2
  }

  checkExactArgCount(context, expression, call.label, expectedArgs)
  checkStringArgs(context, argInfos)

  return returnType
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

  const firstArg = argInfos[0]

  if (firstArg !== null && typeof firstArg !== 'undefined') {
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
