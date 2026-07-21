import { diagnostic } from '../diagnostics.ts'
import type { CompilerLibrarySet } from '../extensions/types.ts'
import type { AnyNode, Diagnostic, ObjectShapeInfo, SourceLocation, SymbolInfo, ValueType } from '../types.ts'
import { isAssignableType } from './assignability.ts'
import type { DeclaredTypeResolverContext } from './declared-types.ts'
import { applyTypeRefMetadataToExpression } from './expression-metadata.ts'
import {
  acceptsArgumentCount,
  argumentCountMessage,
  argumentParamValueType,
  paramForArgument
} from './helpers.ts'
import { callExpressionArgumentLabel } from './expression-helpers.ts'

export type CallableSymbolCheckerContext = {
  declaredTypes: DeclaredTypeResolverContext
  diagnostics: Diagnostic[]
  libraries: CompilerLibrarySet
}

export type CallableCallArgInfo = {
  valueType: ValueType
  nullable: boolean
  loc: SourceLocation
}

function report(
  context: CallableSymbolCheckerContext,
  code: string,
  message: string,
  loc: SourceLocation | null | undefined
): void {
  context.diagnostics.push(diagnostic(code, message, loc))
}

function checkAssignableType(
  context: CallableSymbolCheckerContext,
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

export function applyCallableSymbolCall(
  context: CallableSymbolCheckerContext,
  expression: AnyNode,
  symbol: SymbolInfo,
  argInfos: CallableCallArgInfo[]
): ValueType {
  symbol = selectCallableOverload(context, symbol, argInfos, expression.args.length)
  let returnType: ValueType = 'unknown'
  const symbolReturnType = symbol.returnType ?? null

  if (symbolReturnType !== null && typeof symbolReturnType !== 'undefined') {
    returnType = symbolReturnType
  }

  let returnAsyncResultValueType: ValueType | null = null
  const symbolReturnAsyncResultValueType = symbol.returnAsyncResultValueType ?? null

  if (symbolReturnAsyncResultValueType !== null && typeof symbolReturnAsyncResultValueType !== 'undefined') {
    returnAsyncResultValueType = symbolReturnAsyncResultValueType
  }

  let returnShape: ObjectShapeInfo | null = null
  const symbolReturnShape = symbol.returnShape

  if (symbolReturnShape !== null && typeof symbolReturnShape !== 'undefined') {
    returnShape = symbolReturnShape
  }

  expression.valueType = returnType
  expression.typeRef = symbol.returnTypeRef ?? null
  expression.nullable = symbol.returnNullable === true
  expression.asyncResultValueType = returnAsyncResultValueType
  if (returnShape !== null) {
    expression.shape = returnShape
  } else if (expression.shape === null || typeof expression.shape === 'undefined') {
    expression.shape = null
  }

  if (expression.typeRef !== null) {
    applyTypeRefMetadataToExpression(context.declaredTypes, expression, expression.typeRef)
  }

  const params = symbol.params ?? null

  if (params === null || typeof params === 'undefined') {
    return returnType
  }

  if (!acceptsArgumentCount(params, expression.args.length)) {
    report(
      context,
      'INOX_ARG_COUNT',
      argumentCountMessage(callExpressionArgumentLabel(expression), params, expression.args.length),
      expression.loc
    )
  }

  for (let index = 0; index < expression.args.length; index = index + 1) {
    const param = paramForArgument(params, index)
    const argInfo = argInfos[index]

    if (
      param !== null &&
      typeof param !== 'undefined' &&
      argInfo !== null &&
      typeof argInfo !== 'undefined'
    ) {
      checkAssignableType(
        context,
        argInfo.valueType,
        argumentParamValueType(param, context.libraries),
        argInfo.loc,
        param.nullable === true || param.optional === true,
        argInfo.nullable
      )
    }
  }

  return returnType
}

function selectCallableOverload(
  context: CallableSymbolCheckerContext,
  symbol: SymbolInfo,
  argInfos: CallableCallArgInfo[],
  argumentCount: number
): SymbolInfo {
  const overloads = symbol.overloads ?? []

  for (const overload of overloads) {
    const params = overload.params ?? []

    if (!acceptsArgumentCount(params, argumentCount)) {
      continue
    }

    let accepts = true

    for (let index = 0; index < argInfos.length; index = index + 1) {
      const param = paramForArgument(params, index)
      const argInfo = argInfos[index]

      if (
        param === null ||
        typeof param === 'undefined' ||
        !isAssignableType(
          argInfo.valueType,
          argumentParamValueType(param, context.libraries),
          param.nullable === true || param.optional === true,
          argInfo.nullable
        )
      ) {
        accepts = false
        break
      }
    }

    if (accepts) {
      return overload
    }
  }

  if (overloads.length > 0) {
    return overloads[0]
  }

  return symbol
}
