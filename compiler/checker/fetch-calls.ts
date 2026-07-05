import {
  fetchInitOptionName,
  isFetchHttpsLiteral,
  isSupportedFetchRedirectLiteral
} from '../../stdlib/global/compiler/checker.ts'
import { diagnostic } from '../diagnostics.ts'
import type { AnyNode, Diagnostic, ObjectShapeInfo, SourceLocation, ValueType } from '../types.ts'
import { isAssignableType } from './assignability.ts'
import { fetchResponseObjectShape } from './builtins.ts'
import type { CheckedCallArgInfo } from './global-calls.ts'

export type CheckedFetchReceiverInfo = {
  valueType: ValueType
  shape: ObjectShapeInfo | null
}

export type CheckedFetchHeaderInfo = {
  key: string
  loc: SourceLocation
  nullable: boolean
  valueLoc: SourceLocation
  valueType: ValueType
}

export type CheckedFetchInitPropertyInfo = {
  key: string
  loc: SourceLocation
  valueLoc: SourceLocation
  valueType: ValueType
  nullable: boolean
  shape: ObjectShapeInfo | null
  valueIsObjectLiteral: boolean
  supportedRedirectLiteral: boolean
  headers: CheckedFetchHeaderInfo[]
}

export type CheckedFetchInitInfo = {
  loc: SourceLocation
  isObjectLiteral: boolean
  properties: CheckedFetchInitPropertyInfo[]
}

export type FetchCallCheckerContext = {
  diagnostics: Diagnostic[]
}

function report(context: FetchCallCheckerContext, code: string, message: string, loc: SourceLocation): void {
  context.diagnostics.push(diagnostic(code, message, loc))
}

function checkAssignableType(
  context: FetchCallCheckerContext,
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

export function checkFetchCall(
  context: FetchCallCheckerContext,
  expression: AnyNode,
  method: string,
  backendAvailable: boolean,
  httpsAvailable: boolean,
  argInfos: CheckedCallArgInfo[],
  initInfo: CheckedFetchInitInfo | null
): ValueType {
  if (!backendAvailable) {
    expression.fetchRuntimeMethod = method
    expression.valueType = 'promise'
    expression.promiseValueType = 'object'
    expression.shape = fetchResponseObjectShape

    return 'promise'
  }

  if (expression.args.length < 1 || expression.args.length > 2) {
    report(
      context,
      'INOX_ARG_COUNT',
      `function fetch expects 1 or 2 argument(s), got ${expression.args.length}`,
      expression.loc
    )
  }

  if (argInfos.length > 0) {
    const firstArg = argInfos[0]

    checkAssignableType(context, firstArg.valueType, 'string', firstArg.loc, false, firstArg.nullable)

    if (isFetchHttpsLiteral(expression.args[0]) && !httpsAvailable) {
      report(
        context,
        'INOX_FETCH',
        'https fetch URLs require a configured TLS adapter and are not supported by the current C/libuv fetch slice',
        firstArg.loc
      )
    }
  }

  if (initInfo !== null) {
    checkFetchInitObject(context, initInfo)
  }

  expression.fetchRuntimeMethod = method
  expression.valueType = 'promise'
  expression.promiseValueType = 'object'
  expression.shape = fetchResponseObjectShape

  return 'promise'
}

export function checkFetchAbortControllerMethodCall(
  context: FetchCallCheckerContext,
  expression: AnyNode,
  method: string,
  receiver: CheckedFetchReceiverInfo
): ValueType | null {
  if (!isFetchBuiltinReceiver(receiver, 'fetch.AbortController')) {
    return null
  }

  if (expression.args.length !== 0) {
    report(
      context,
      'INOX_ARG_COUNT',
      `function AbortController.abort expects 0 argument(s), got ${expression.args.length}`,
      expression.loc
    )
  }

  expression.fetchRuntimeMethod = method
  expression.valueType = 'void'

  return 'void'
}

export type CheckedFetchResponseBodyMethodInfo = {
  method: string
  supported: boolean
}

export function checkFetchResponseMethodCall(
  context: FetchCallCheckerContext,
  expression: AnyNode,
  methodInfo: CheckedFetchResponseBodyMethodInfo,
  receiver: CheckedFetchReceiverInfo
): ValueType | null {
  if (!isFetchBuiltinReceiver(receiver, 'fetch.Response')) {
    return null
  }

  if (expression.args.length !== 0) {
    report(
      context,
      'INOX_ARG_COUNT',
      `function Response.${expression.callee.property} expects 0 argument(s), got ${expression.args.length}`,
      expression.loc
    )
  }

  if (!methodInfo.supported) {
    report(
      context,
      'INOX_FETCH',
      `Response.${expression.callee.property} is not supported by the current C/libuv fetch slice`,
      expression.loc
    )
    expression.valueType = 'promise'
    expression.promiseValueType = 'unknown'

    return 'promise'
  }

  expression.fetchRuntimeMethod = 'text'
  expression.valueType = 'promise'
  expression.promiseValueType = 'string'

  return 'promise'
}

export function checkFetchUnsupportedResponseBodyMember(
  context: FetchCallCheckerContext,
  expression: AnyNode,
  unsupported: boolean,
  receiver: CheckedFetchReceiverInfo
): ValueType | null {
  if (!unsupported) {
    return null
  }

  if (!isFetchBuiltinReceiver(receiver, 'fetch.Response')) {
    return null
  }

  report(
    context,
    'INOX_FETCH',
    'Response.body streams are not supported by the current C/libuv fetch slice',
    expression.loc
  )
  expression.valueType = 'object'

  return 'object'
}

export function checkFetchHeadersMethodCall(
  context: FetchCallCheckerContext,
  expression: AnyNode,
  method: string,
  receiver: CheckedFetchReceiverInfo,
  argInfos: CheckedCallArgInfo[]
): ValueType | null {
  if (!isFetchBuiltinReceiver(receiver, 'fetch.Headers')) {
    return null
  }

  if (expression.args.length !== 1) {
    report(
      context,
      'INOX_ARG_COUNT',
      `function Headers.${expression.callee.property} expects 1 argument(s), got ${expression.args.length}`,
      expression.loc
    )
  }

  if (argInfos.length > 0) {
    const firstArg = argInfos[0]

    checkAssignableType(context, firstArg.valueType, 'string', firstArg.loc, false, firstArg.nullable)
  }

  expression.fetchRuntimeMethod = method
  expression.valueType = 'boolean'
  expression.nullable = false

  if (method === 'headersGet') {
    expression.valueType = 'string'
    expression.nullable = true
  }

  return expression.valueType
}

function checkFetchInitObject(context: FetchCallCheckerContext, expression: CheckedFetchInitInfo): void {
  if (!expression.isObjectLiteral) {
    report(
      context,
      'INOX_FETCH',
      'fetch init must be an object literal in the current C/libuv fetch slice',
      expression.loc
    )
    return
  }

  for (const property of expression.properties) {
    const optionName = fetchInitOptionName(property.key)

    if (optionName === null || typeof optionName === 'undefined') {
      report(
        context,
        'INOX_FETCH',
        `fetch init option ${property.key} is not supported by the current C/libuv fetch slice`,
        property.loc
      )
      continue
    }

    if (property.key === 'method' || property.key === 'redirect') {
      checkAssignableType(context, property.valueType, 'string', property.valueLoc, false, property.nullable)

      if (property.key === 'redirect' && !property.supportedRedirectLiteral) {
        report(
          context,
          'INOX_FETCH',
          "fetch init redirect must be 'follow', 'manual' or 'error' in the current C/libuv fetch slice",
          property.valueLoc
        )
      }
      continue
    }

    if (property.key === 'body') {
      if (property.valueType !== 'string' && property.valueType !== 'bytes') {
        report(
          context,
          'INOX_FETCH',
          'fetch init body must be a string, Buffer or Uint8Array in the current C/libuv fetch slice',
          property.valueLoc
        )
      }
      continue
    }

    if (property.key === 'signal') {
      if (
        property.valueType !== 'object' ||
        property.shape === null ||
        typeof property.shape === 'undefined' ||
        property.shape.builtin !== 'fetch.AbortSignal'
      ) {
        report(
          context,
          'INOX_FETCH',
          'fetch init signal must be an AbortSignal in the current C/libuv fetch slice',
          property.valueLoc
        )
      }
      continue
    }

    if (!property.valueIsObjectLiteral) {
      report(
        context,
        'INOX_FETCH',
        'fetch init headers must be an object literal in the current C/libuv fetch slice',
        property.valueLoc
      )
      continue
    }

    for (const header of property.headers) {
      checkAssignableType(context, header.valueType, 'string', header.valueLoc, false, header.nullable)
    }
  }
}

function isFetchBuiltinReceiver(receiver: CheckedFetchReceiverInfo, builtin: string): boolean {
  return (
    receiver.valueType === 'object' &&
    receiver.shape !== null &&
    typeof receiver.shape !== 'undefined' &&
    receiver.shape.builtin === builtin
  )
}
