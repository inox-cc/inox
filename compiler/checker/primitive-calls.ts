import {
  isNumericCastName,
  isStringIndexMethod,
  isStringPredicateMethod,
  stringRuntimeMethodName
} from '../../stdlib/global/compiler/descriptor.ts'
import { diagnostic } from '../diagnostics.ts'
import type { AnyNode, Diagnostic, SourceLocation, ValueType } from '../types.ts'
import { isAssignableType } from './assignability.ts'
import {
  isStringTrimMethod,
  stringPredicateArgCountMessage
} from './helpers.ts'
import { firstPathSegment } from './resolved-types.ts'

export type PrimitiveCallCheckerContext = {
  diagnostics: Diagnostic[]
}

function report(
  context: PrimitiveCallCheckerContext,
  code: string,
  message: string,
  loc: SourceLocation | null | undefined
): void {
  context.diagnostics.push(diagnostic(code, message, loc))
}

function expressionCanBeNull(expression: AnyNode | null | undefined): boolean {
  if (expression === null || typeof expression === 'undefined') {
    return false
  }

  return expression.type === 'NullLiteral' || expression.nullable === true
}

function checkAssignableType(
  context: PrimitiveCallCheckerContext,
  actual: ValueType | null | undefined,
  expected: ValueType | null | undefined,
  loc: SourceLocation | null | undefined,
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

export function numericCastName(expression: AnyNode): string | null {
  if (expression.callee.type !== 'Reference' || expression.callee.path.length !== 1) {
    return null
  }

  const castName = firstPathSegment(expression.callee.path)

  if (!isNumericCastName(castName)) {
    return null
  }

  return castName
}

export function checkNumericCastCall(
  context: PrimitiveCallCheckerContext,
  expression: AnyNode,
  castName: string,
  argTypes: ValueType[]
): ValueType {
  expression.valueType = 'number'
  expression.numericCast = castName

  if (expression.args.length !== 1) {
    report(context, 'INOX_ARG_COUNT', `${castName} expects 1 argument(s), got ${expression.args.length}`, expression.loc)
    return 'number'
  }

  checkAssignableType(
    context,
    argTypes[0],
    'number',
    expression.args[0].loc,
    false,
    expressionCanBeNull(expression.args[0])
  )

  return 'number'
}

export function isNumberToStringCall(expression: AnyNode): boolean {
  return expression.callee.type === 'MemberExpression' && expression.callee.property === 'toString'
}

export function checkNumberToStringCall(
  context: PrimitiveCallCheckerContext,
  expression: AnyNode,
  objectType: ValueType,
  argTypes: ValueType[]
): ValueType | null {
  if (objectType !== 'number') {
    return null
  }

  expression.valueType = 'string'
  expression.numberRuntimeMethod = 'toString'

  if (expression.args.length > 1) {
    report(
      context,
      'INOX_ARG_COUNT',
      `number.toString expects 0 or 1 argument(s), got ${expression.args.length}`,
      expression.loc
    )
  }

  if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
    checkAssignableType(
      context,
      argTypes[0],
      'number',
      expression.args[0].loc,
      false,
      expressionCanBeNull(expression.args[0])
    )
  }

  return 'string'
}

export function isStringCharCodeAtCall(expression: AnyNode): boolean {
  return expression.callee.type === 'MemberExpression' && expression.callee.property === 'charCodeAt'
}

export function checkStringCharCodeAtCall(
  context: PrimitiveCallCheckerContext,
  expression: AnyNode,
  objectType: ValueType,
  argTypes: ValueType[]
): ValueType | null {
  if (objectType !== 'string') {
    return null
  }

  expression.valueType = 'number'
  expression.stringRuntimeMethod = 'charCodeAt'

  if (expression.args.length !== 1) {
    report(
      context,
      'INOX_ARG_COUNT',
      `string.charCodeAt expects 1 argument(s), got ${expression.args.length}`,
      expression.loc
    )
    return 'number'
  }

  checkAssignableType(
    context,
    argTypes[0],
    'number',
    expression.args[0].loc,
    false,
    expressionCanBeNull(expression.args[0])
  )

  return 'number'
}

export function stringTrimMethodName(expression: AnyNode): string | null {
  let method: string | null = null

  if (expression.callee.type === 'MemberExpression') {
    method = stringRuntimeMethodName(expression.callee.property)
  }

  if (!isStringTrimMethod(method)) {
    return null
  }

  return method
}

export function checkStringTrimCall(
  context: PrimitiveCallCheckerContext,
  expression: AnyNode,
  objectType: ValueType,
  method: string
): ValueType | null {
  if (objectType !== 'string') {
    return null
  }

  if (expression.args.length !== 0) {
    report(
      context,
      'INOX_ARG_COUNT',
      `string.${method} expects 0 argument(s), got ${expression.args.length}`,
      expression.loc
    )
  }

  expression.valueType = 'string'
  expression.stringRuntimeMethod = method

  return 'string'
}

export function isStringCaseCall(expression: AnyNode): boolean {
  return expression.callee.type === 'MemberExpression' && expression.callee.property === 'toUpperCase'
}

export function checkStringCaseCall(
  context: PrimitiveCallCheckerContext,
  expression: AnyNode,
  objectType: ValueType
): ValueType | null {
  if (objectType !== 'string') {
    return null
  }

  if (expression.args.length !== 0) {
    report(
      context,
      'INOX_ARG_COUNT',
      `string.toUpperCase expects 0 argument(s), got ${expression.args.length}`,
      expression.loc
    )
  }

  expression.valueType = 'string'
  expression.stringRuntimeMethod = 'toUpperCase'

  return 'string'
}

export function isStringPadStartCall(expression: AnyNode): boolean {
  return expression.callee.type === 'MemberExpression' && expression.callee.property === 'padStart'
}

export function checkStringPadStartCall(
  context: PrimitiveCallCheckerContext,
  expression: AnyNode,
  objectType: ValueType,
  argTypes: ValueType[]
): ValueType | null {
  if (objectType !== 'string') {
    return null
  }

  if (expression.args.length < 1 || expression.args.length > 2) {
    report(
      context,
      'INOX_ARG_COUNT',
      `string.padStart expects 1 or 2 argument(s), got ${expression.args.length}`,
      expression.loc
    )
  }

  if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
    checkAssignableType(context, argTypes[0], 'number', expression.args[0].loc, false, false)
  }

  if (expression.args.length > 1) {
    checkAssignableType(
      context,
      argTypes[1],
      'string',
      expression.args[1].loc,
      false,
      expressionCanBeNull(expression.args[1])
    )
  }

  expression.valueType = 'string'
  expression.stringRuntimeMethod = 'padStart'

  return 'string'
}

export function stringIndexMethodName(expression: AnyNode): string | null {
  let method: string | null = null

  if (expression.callee.type === 'MemberExpression') {
    method = stringRuntimeMethodName(expression.callee.property)
  }

  if (method === null || typeof method === 'undefined' || !isStringIndexMethod(method)) {
    return null
  }

  return method
}

export function checkStringIndexCall(
  context: PrimitiveCallCheckerContext,
  expression: AnyNode,
  objectType: ValueType,
  method: string,
  argTypes: ValueType[]
): ValueType | null {
  if (objectType !== 'string') {
    return null
  }

  if (expression.args.length < 1 || expression.args.length > 2) {
    report(
      context,
      'INOX_ARG_COUNT',
      `string.${method} expects 1 or 2 argument(s), got ${expression.args.length}`,
      expression.loc
    )
  }

  if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
    checkAssignableType(
      context,
      argTypes[0],
      'string',
      expression.args[0].loc,
      false,
      expressionCanBeNull(expression.args[0])
    )
  }

  if (expression.args.length > 1) {
    checkAssignableType(context, argTypes[1], 'number', expression.args[1].loc, false, false)
  }

  expression.valueType = 'number'
  expression.stringRuntimeMethod = method

  return 'number'
}

export function stringSliceMethodName(expression: AnyNode): string | null {
  let method: string | null = null

  if (expression.callee.type === 'MemberExpression') {
    method = stringRuntimeMethodName(expression.callee.property)
  }

  if (method !== 'slice') {
    return null
  }

  return method
}

export function checkStringSliceCall(
  context: PrimitiveCallCheckerContext,
  expression: AnyNode,
  objectType: ValueType,
  method: string,
  argTypes: ValueType[]
): ValueType | null {
  if (objectType !== 'string') {
    return null
  }

  if (expression.args.length < 1 || expression.args.length > 2) {
    report(
      context,
      'INOX_ARG_COUNT',
      `string.slice expects 1 or 2 argument(s), got ${expression.args.length}`,
      expression.loc
    )
  }

  for (let index = 0; index < argTypes.length; index = index + 1) {
    const argType = argTypes[index]

    checkAssignableType(context, argType, 'number', expression.args[index].loc, false, false)
  }

  expression.valueType = 'string'
  expression.stringRuntimeMethod = method

  return 'string'
}

export function stringSplitMethodName(expression: AnyNode): string | null {
  let method: string | null = null

  if (expression.callee.type === 'MemberExpression') {
    method = stringRuntimeMethodName(expression.callee.property)
  }

  if (method !== 'split') {
    return null
  }

  return method
}

export function checkStringSplitCall(
  context: PrimitiveCallCheckerContext,
  expression: AnyNode,
  objectType: ValueType,
  method: string,
  argTypes: ValueType[]
): ValueType | null {
  if (objectType !== 'string') {
    return null
  }

  if (expression.args.length !== 1) {
    report(context, 'INOX_ARG_COUNT', `string.split expects 1 argument(s), got ${expression.args.length}`, expression.loc)
  }

  if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
    checkAssignableType(
      context,
      argTypes[0],
      'string',
      expression.args[0].loc,
      false,
      expressionCanBeNull(expression.args[0])
    )
  }

  expression.valueType = 'array'
  expression.stringRuntimeMethod = method

  return 'array'
}

export function isStringPredicateCall(expression: AnyNode): boolean {
  return expression.callee.type === 'MemberExpression' && isStringPredicateMethod(expression.callee.property)
}

export function checkStringPredicateCall(
  context: PrimitiveCallCheckerContext,
  expression: AnyNode,
  objectType: ValueType,
  argTypes: ValueType[]
): ValueType | null {
  const method = expression.callee.property
  let maxArgs = 1

  if (method === 'includes') {
    maxArgs = 2
  }

  if (objectType !== 'string') {
    return null
  }

  if (expression.args.length < 1 || expression.args.length > maxArgs) {
    report(context, 'INOX_ARG_COUNT', stringPredicateArgCountMessage(method, expression.args.length), expression.loc)
  }

  if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
    checkAssignableType(
      context,
      argTypes[0],
      'string',
      expression.args[0].loc,
      false,
      expressionCanBeNull(expression.args[0])
    )
  }

  if (expression.args.length > 1) {
    checkAssignableType(context, argTypes[1], 'number', expression.args[1].loc, false, false)
  }

  expression.valueType = 'boolean'
  expression.stringRuntimeMethod = method

  return 'boolean'
}
