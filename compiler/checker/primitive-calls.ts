import { isNumericCastName } from '../../stdlib/global/compiler/descriptor.ts'
import { diagnostic } from '../diagnostics.ts'
import type { AnyNode, Diagnostic, SourceLocation, ValueType } from '../types.ts'
import { isAssignableType } from './assignability.ts'
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
