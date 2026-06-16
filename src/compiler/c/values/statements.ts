import {
  emitPrepareOwnedValueWrite,
  emitRuntimeTypeCheck,
  emitStatusCheck,
  narrowNullableScalars,
  nextCName,
  pushNullableScalarNarrowing,
  pushVariableScope,
  registerBoxedValue,
  registerOwnedValue,
  restoreNullableScalarNarrowing,
  restoreVariableScope
} from '../context.ts'
import { isRuntimeFunctionType, normalizeFunctionType } from '../async/callbacks.ts'
import { diagnostic } from '../../diagnostics.ts'
import { emitRuntimeNullableValueCheck, emitRuntimeValueCheck } from '../runtime-values.ts'
import { cUnsupportedExpressionCode, cUnsupportedVariableDeclarationCode, containsAwaitExpression } from '../syntax.ts'
import { cRuntimeValueTag, isManagedRuntimeReturnType, isNullableScalarType, isRuntimeNullableType } from '../value-types.ts'
import { resolveRuntimeArrayElementType } from './arrays.ts'
import { resolveRuntimeMapType, resolveRuntimeSetElementType } from './collections.ts'
import { emitCConditionClause, emitCNegatedConditionClause } from './expressions.ts'
import { emitNullableRuntimeValueVariableDeclaration } from './nullable.ts'
import { registerObjectShape } from './objects.ts'
import { isRawStringLiteralExpression } from './strings.ts'
import type { CFunctionContext } from '../context.ts'
import type { PreparedArrayExpression } from './arrays.ts'
import type { AnyNode, SourceLocation } from '../../types.ts'
import type {
  CArrayElementInfo,
  CKnownArrayElement,
  CKnownObjectField,
  CKnownObjectIndexField,
  CFunctionType,
  CObjectShape,
  CPreparedCallOptions as PreparedCallOptions,
  CPreparedExpression as PreparedExpression,
  CPreparedStatement as PreparedStatement,
  CRuntimeArrayElement
} from '../types.ts'

type CSourceLocation = SourceLocation | null | undefined

type KnownForOfArray = {
  elements: CArrayElementInfo[]
  name: string
}

type RuntimeForOfArray = {
  elementType: string
  lines: string[]
  name: string
}

type RuntimeForOfMap = {
  keyType: string
  lines: string[]
  name: string
  valueType: string
}

type RuntimeForOfSet = {
  elementType: string
  lines: string[]
  name: string
}

type NullableScalarConditionNarrowing = {
  trueNames: string[]
  falseNames: string[]
}

export type StatementLoweringDependencies = {
  emitArrayVariableDeclaration(statement: AnyNode, context: CFunctionContext): string[]
  emitArrayFilterVariableDeclaration(
    statement: AnyNode,
    filtered: PreparedArrayExpression,
    context: CFunctionContext
  ): string[]
  emitArrayMapVariableDeclaration(statement: AnyNode, mapped: PreparedArrayExpression, context: CFunctionContext): string[]
  emitArraySortVariableDeclaration(statement: AnyNode, sorted: PreparedArrayExpression, context: CFunctionContext): string[]
  emitBoxedObjectVariableDeclaration(statement: AnyNode, context: CFunctionContext): string[]
  emitCAwaitValueExpression(expression: AnyNode, context: CFunctionContext): PreparedExpression
  emitCExpression(expression: AnyNode, context: CFunctionContext): string
  emitClassObjectVariableDeclaration(statement: AnyNode, context: CFunctionContext): string[]
  emitCObjectLiteralValueExpression(
    expression: AnyNode,
    context: CFunctionContext,
    shape?: CObjectShape | null
  ): PreparedExpression
  emitCValueExpression(expression: AnyNode, context: CFunctionContext): PreparedExpression
  collectionConstructorName(expression: AnyNode): string | null
  emitDgramAddressVariableDeclaration(statement: AnyNode, context: CFunctionContext): string[] | null
  emitDgramNumberVariableDeclaration(statement: AnyNode, context: CFunctionContext): string[] | null
  emitDgramSocketVariableDeclaration(statement: AnyNode, context: CFunctionContext): string[] | null
  emitDgramSocketCallStatement(expression: AnyNode, context: CFunctionContext): string[] | null
  emitDynamicObjectMemberVariableDeclaration(
    statement: AnyNode,
    member: CKnownObjectIndexField,
    context: CFunctionContext
  ): string[]
  emitDynamicObjectMemberAssignment(expression: AnyNode, member: CKnownObjectIndexField, context: CFunctionContext): string[]
  emitErrorObjectVariableDeclaration(statement: AnyNode, context: CFunctionContext): string[]
  emitFailureStatement(context: CFunctionContext): string
  emitFetchAbortControllerVariableDeclaration(statement: AnyNode, context: CFunctionContext): string[] | null
  emitFetchAbortControllerAbortStatement(expression: AnyNode, context: CFunctionContext): string[] | null
  emitFunctionPointerVariable(
    name: string,
    init: AnyNode,
    context: CFunctionContext,
    isConst: boolean,
    functionType: CFunctionType | null | undefined,
    loc: CSourceLocation
  ): string
  emitHttpServerVariableDeclaration(statement: AnyNode, context: CFunctionContext): string[] | null
  emitHttpServerCallStatement(expression: AnyNode, context: CFunctionContext): string[] | null
  emitJsonParseVariableDeclaration(statement: AnyNode, context: CFunctionContext): string[] | null
  emitKnownArrayIndexAssignment(expression: AnyNode, element: CKnownArrayElement, context: CFunctionContext): string[]
  emitKnownArrayIndexVariableDeclaration(
    statement: AnyNode,
    element: CKnownArrayElement,
    context: CFunctionContext
  ): string[]
  emitKnownObjectMemberAssignment(expression: AnyNode, member: CKnownObjectField, context: CFunctionContext): string[]
  emitKnownObjectMemberVariableDeclaration(
    statement: AnyNode,
    member: CKnownObjectField,
    context: CFunctionContext
  ): string[]
  emitNetAddressMemberVariableDeclaration(statement: AnyNode, context: CFunctionContext): string[] | null
  emitNetAddressVariableDeclaration(statement: AnyNode, context: CFunctionContext): string[] | null
  emitNetNumberVariableDeclaration(statement: AnyNode, context: CFunctionContext): string[] | null
  emitNetServerCallStatement(expression: AnyNode, context: CFunctionContext): string[] | null
  emitNetServerVariableDeclaration(statement: AnyNode, context: CFunctionContext): string[] | null
  emitNetSocketCallStatement(expression: AnyNode, context: CFunctionContext): string[] | null
  emitNetSocketVariableDeclaration(statement: AnyNode, context: CFunctionContext): string[] | null
  emitNullableScalarValueExpression(expression: AnyNode, context: CFunctionContext): PreparedExpression
  emitNullableRuntimeValueAssignment(expression: AnyNode, context: CFunctionContext): string[]
  emitObjectVariableDeclaration(statement: AnyNode, context: CFunctionContext): string[]
  emitOptionalRuntimeCallbackCallExpression(expression: AnyNode, context: CFunctionContext): string[]
  emitPreparedArrayFilterCallExpression(
    expression: AnyNode,
    context: CFunctionContext
  ): PreparedArrayExpression | null
  emitPreparedArrayMapCallExpression(expression: AnyNode, context: CFunctionContext): PreparedArrayExpression | null
  emitPreparedArrayPopCallExpression(
    expression: AnyNode,
    context: CFunctionContext,
    options: PreparedCallOptions | null
  ): PreparedExpression | null
  emitPreparedArrayPushCallExpression(expression: AnyNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedArraySortCallExpression(
    expression: AnyNode,
    context: CFunctionContext
  ): PreparedArrayExpression | null
  emitPreparedAsyncFunctionPromiseCallExpression(expression: AnyNode, context: CFunctionContext, options?: PreparedCallOptions): PreparedExpression | null
  emitPreparedBytesIndexAssignment(expression: AnyNode, context: CFunctionContext): PreparedStatement | null
  emitPreparedCallExpression(expression: AnyNode, context: CFunctionContext): PreparedExpression
  emitPreparedChildProcessCallExpression(expression: AnyNode, context: CFunctionContext, options?: PreparedCallOptions): PreparedExpression | null
  emitPreparedClassMethodCallExpression(expression: AnyNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedCollectionCallExpression(expression: AnyNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedCryptoCallExpression(expression: AnyNode, context: CFunctionContext, options?: PreparedCallOptions): PreparedExpression | null
  emitPreparedCryptoHashCallExpression(expression: AnyNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedCryptoHmacCallExpression(expression: AnyNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedCryptoNumberCallExpression(expression: AnyNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedDebugMemoryCallExpression(expression: AnyNode, context: CFunctionContext, options?: PreparedCallOptions): PreparedExpression | null
  emitPreparedFetchCallExpression(expression: AnyNode, context: CFunctionContext, options?: PreparedCallOptions): PreparedExpression | null
  emitPreparedFetchHeadersCallExpression(expression: AnyNode, context: CFunctionContext, options?: PreparedCallOptions): PreparedExpression | null
  emitPreparedFsCallExpression(expression: AnyNode, context: CFunctionContext, options?: PreparedCallOptions): PreparedExpression | null
  emitPreparedFsSyncStatementExpression(expression: AnyNode, context: CFunctionContext): PreparedStatement | null
  emitPreparedMapIndexAssignment(expression: AnyNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedNumberExpression(expression: AnyNode, context: CFunctionContext): PreparedExpression
  emitPreparedPathObjectCallExpression(expression: AnyNode, context: CFunctionContext, options?: PreparedCallOptions): PreparedExpression | null
  emitPreparedPromiseConstructorExpression(expression: AnyNode, context: CFunctionContext, options?: PreparedCallOptions): PreparedExpression | null
  emitPreparedPromiseExpression(expression: AnyNode, context: CFunctionContext, options?: PreparedCallOptions): PreparedExpression | null
  emitPreparedPromiseMethodExpression(expression: AnyNode, context: CFunctionContext, options?: PreparedCallOptions): PreparedExpression | null
  emitPreparedPromiseReturningCallExpression(expression: AnyNode, context: CFunctionContext, options?: PreparedCallOptions): PreparedExpression | null
  emitPreparedPromiseStaticExpression(expression: AnyNode, context: CFunctionContext, options?: PreparedCallOptions): PreparedExpression | null
  emitPreparedTimerCallExpression(expression: AnyNode, context: CFunctionContext, options?: PreparedCallOptions): PreparedExpression | null
  emitPreparedUpdateExpression(expression: AnyNode, context: CFunctionContext): PreparedExpression
  emitPreparedUrlObjectExpression(expression: AnyNode, context: CFunctionContext, options?: PreparedCallOptions): PreparedExpression | null
  emitPreparedUrlSearchParamsObjectExpression(expression: AnyNode, context: CFunctionContext, options?: PreparedCallOptions): PreparedExpression | null
  emitProcessExitCodeAssignment(expression: AnyNode, context: CFunctionContext): string[] | null
  emitProcessExitStatement(expression: AnyNode, context: CFunctionContext): string[] | null
  emitPromiseConstructorSettlementCall(expression: AnyNode, context: CFunctionContext): string[] | null
  emitReference(expression: AnyNode, context: CFunctionContext): string
  emitRuntimeCallbackVariableDeclaration(statement: AnyNode, context: CFunctionContext): string[]
  emitScalarVariableDeclaration(statement: AnyNode, context: CFunctionContext): string[]
  emitStatement(statement: AnyNode, context: CFunctionContext): string[]
  emitStringExpression(expression: AnyNode, context: CFunctionContext): string
  emitUrlObjectFieldAssignment(expression: AnyNode, context: CFunctionContext): string[] | null
  inferCatchBindingValueType(statement: AnyNode, context: CFunctionContext): string
  inferExpressionType(expression: AnyNode, context: CFunctionContext): string
  isArrayMethodCall(expression: AnyNode): boolean
  isBoxedRuntimeValueAssignment(expression: AnyNode, context: CFunctionContext): boolean
  isClassConstructorExpression(expression: AnyNode, context: CFunctionContext): boolean
  isConsoleLog(expression: AnyNode): boolean
  isCollectionConstructorExpression(expression: AnyNode): boolean
  isErrorConstructorExpression(expression: AnyNode): boolean
  isErrorValueExpression(expression: AnyNode, context: CFunctionContext): boolean
  isIndexAccessExpression(expression: AnyNode): boolean
  isMemberAccessExpression(expression: AnyNode): boolean
  isNullableRuntimeValueAssignment(expression: AnyNode, context: CFunctionContext): boolean
  isRuntimeProducedStringExpression(expression: AnyNode, context: CFunctionContext): boolean
  registerErrorObjectShape(context: CFunctionContext, name: string): void
  resolveForOfElementType(elements: CArrayElementInfo[]): string
  resolveKnownArrayIndex(expression: AnyNode, context: CFunctionContext): CKnownArrayElement | null
  resolveKnownObjectIndex(expression: AnyNode, context: CFunctionContext): CKnownObjectIndexField | null
  resolveKnownObjectMember(expression: AnyNode, context: CFunctionContext): CKnownObjectField | null
  resolveKnownForOfArray(expression: AnyNode, context: CFunctionContext): KnownForOfArray | null
  resolveNullableScalarConditionNarrowing(
    expression: AnyNode,
    context: CFunctionContext
  ): NullableScalarConditionNarrowing
  resolveRuntimeStringReference(expression: AnyNode, context: CFunctionContext): string | null
  resolveRuntimeArrayIndex(expression: AnyNode, context: CFunctionContext): CRuntimeArrayElement | null
  resolveRuntimeForOfArray(expression: AnyNode, context: CFunctionContext): RuntimeForOfArray | null
  resolveRuntimeForOfMap(expression: AnyNode, context: CFunctionContext): RuntimeForOfMap | null
  resolveRuntimeForOfSet(expression: AnyNode, context: CFunctionContext): RuntimeForOfSet | null
  emitBoxedRuntimeValueAssignment(expression: AnyNode, context: CFunctionContext): string[]
  emitConsoleLogStatement(method: string, args: AnyNode[], context: CFunctionContext): string[]
}

function statementDeps(context: CFunctionContext): StatementLoweringDependencies {
  return context.statementLoweringDependencies
}

function pushAllLines(target: string[], source: string[]): void {
  for (const line of source) {
    target.push(line)
  }
}

function pushIndentedLines(target: string[], source: string[], indent: string): void {
  for (const line of source) {
    target.push(`${indent}${line}`)
  }
}

function constPrefix(isConst: boolean): string {
  if (isConst) {
    return 'const '
  }

  return ''
}

function stringOrUnknown(value: string | null | undefined): string {
  if (value != null) {
    return value
  }

  return 'unknown'
}

function nodeLocOrFallback(node, fallback: CSourceLocation): CSourceLocation {
  if (node != null && node.loc != null) {
    return node.loc
  }

  return fallback
}

function lastStringOrNull(values: string[]): string | null {
  if (values.length === 0) {
    return null
  }

  return values[values.length - 1]
}

function lastFlowTargetOrNull(values) {
  if (values.length === 0) {
    return null
  }

  return values[values.length - 1]
}

export function emitStatementBody(statement, context: CFunctionContext) {
  if (statement.type === 'BlockStatement') {
    return emitStatementList(statement.body, context)
  }

  return statementDeps(context).emitStatement(statement, context)
}

export function emitStatementList(statements, context: CFunctionContext) {
  const result: string[] = []

  for (const statement of statements) {
    const lines = statementDeps(context).emitStatement(statement, context)
    pushAllLines(result, lines)

    applyNullableScalarEarlyReturnNarrowing(statement, context)
  }

  return result
}

function applyNullableScalarEarlyReturnNarrowing(statement, context: CFunctionContext) {
  if (
    statement.type !== 'IfStatement' ||
    statement.alternate != null ||
    !statementDefinitelyReturns(statement.consequent)
  ) {
    return
  }

  const narrowing = statementDeps(context).resolveNullableScalarConditionNarrowing(statement.condition, context)

  narrowNullableScalars(context, narrowing.falseNames)
}

function statementDefinitelyReturns(statement) {
  if (statement.type === 'ReturnStatement') {
    return true
  }

  if (statement.type === 'BlockStatement') {
    return statement.body.some(statementDefinitelyReturns)
  }

  if (statement.type === 'IfStatement' && statement.alternate != null) {
    return statementDefinitelyReturns(statement.consequent) && statementDefinitelyReturns(statement.alternate)
  }

  return false
}

function emitScopedStatementBody(statement: AnyNode, context: CFunctionContext, narrowedNames: string[]): string[] {
  const variableScope = pushVariableScope(context)

  try {
    const nullableScope = pushNullableScalarNarrowing(context, narrowedNames)

    try {
      return emitStatementBody(statement, context)
    } finally {
      restoreNullableScalarNarrowing(context, nullableScope)
    }
  } finally {
    restoreVariableScope(context, variableScope)
  }
}

function emitScopedStatementList(statements: AnyNode[], context: CFunctionContext): string[] {
  const variableScope = pushVariableScope(context)

  try {
    return emitStatementList(statements, context)
  } finally {
    restoreVariableScope(context, variableScope)
  }
}

export function emitIfStatement(statement, context: CFunctionContext) {
  const condition = statementDeps(context).emitPreparedNumberExpression(statement.condition, context)
  const narrowing = statementDeps(context).resolveNullableScalarConditionNarrowing(statement.condition, context)
  const lines: string[] = []
  pushAllLines(lines, condition.lines)
  lines.push(`if ${emitCConditionClause(condition.expression)} {`)
  pushIndentedLines(lines, emitScopedStatementBody(statement.consequent, context, narrowing.trueNames), '  ')

  if (statement.alternate == null) {
    lines.push('}')
    return lines
  }

  lines.push('} else {')
  pushIndentedLines(lines, emitScopedStatementBody(statement.alternate, context, narrowing.falseNames), '  ')
  lines.push('}')

  return lines
}

export function emitWhileStatement(statement, context: CFunctionContext) {
  const condition = statementDeps(context).emitPreparedNumberExpression(statement.condition, context)
  const narrowing = statementDeps(context).resolveNullableScalarConditionNarrowing(statement.condition, context)
  const breakLabel = nextCName(context, 'ccjs_break')
  const continueLabel = nextCName(context, 'ccjs_continue')
  const body = withBreakTarget(context, breakLabel, false, () =>
    withContinueTarget(context, continueLabel, false, () =>
      emitScopedStatementBody(statement.body, context, narrowing.trueNames)
    )
  )

  if (condition.lines.length === 0) {
    const lines: string[] = []
    lines.push(`while ${emitCConditionClause(condition.expression)} {`)
    pushIndentedLines(lines, body, '  ')
    pushAllLines(lines, emitContinueTargetLabel(continueLabel, context))
    lines.push('}')
    pushAllLines(lines, emitBreakTargetLabel(breakLabel, context))

    return lines
  }

  const lines: string[] = []
  lines.push('while (1) {')
  pushIndentedLines(lines, condition.lines, '  ')
  lines.push(`  if ${emitCNegatedConditionClause(condition.expression)} break;`)
  pushIndentedLines(lines, body, '  ')
  pushAllLines(lines, emitContinueTargetLabel(continueLabel, context))
  lines.push('}')
  pushAllLines(lines, emitBreakTargetLabel(breakLabel, context))

  return lines
}

export function emitForStatement(statement, context: CFunctionContext) {
  const variableScope = pushVariableScope(context)

  try {
    const init = emitPreparedForInitializer(statement.init, context)
    const test = emitPreparedForExpressionClause(statement.test, context)
    const update = emitPreparedForExpressionClause(statement.update, context)
    const narrowing = statementDeps(context).resolveNullableScalarConditionNarrowing(statement.test, context)
    const breakLabel = nextCName(context, 'ccjs_break')
    const continueLabel = nextCName(context, 'ccjs_continue')
    const body = withBreakTarget(context, breakLabel, false, () =>
      withContinueTarget(context, continueLabel, false, () =>
        emitScopedStatementBody(statement.body, context, narrowing.trueNames)
      )
    )
    const needsPreparedLowering = init.lines.length > 0 || test.lines.length > 0 || update.lines.length > 0

    if (!needsPreparedLowering) {
      const lines: string[] = []
      lines.push(`for (${init.expression}; ${test.expression}; ${update.expression}) {`)
      pushIndentedLines(lines, body, '  ')
      pushAllLines(lines, emitContinueTargetLabel(continueLabel, context))
      lines.push('}')
      pushAllLines(lines, emitBreakTargetLabel(breakLabel, context))

      return lines
    }

    const lines = ['{']

    pushIndentedLines(lines, init.lines, '  ')

    if (init.expression !== '') {
      lines.push(`  ${init.expression};`)
    }

    lines.push('  for (;;) {')
    pushIndentedLines(lines, test.lines, '    ')

    if (test.expression !== '') {
      lines.push(`    if ${emitCNegatedConditionClause(test.expression)} break;`)
    }

    pushIndentedLines(lines, body, '    ')
    pushIndentedLines(lines, emitContinueTargetLabel(continueLabel, context), '  ')
    pushIndentedLines(lines, update.lines, '    ')

    if (update.expression !== '') {
      lines.push(`    ${update.expression};`)
    }

    lines.push('  }')
    pushIndentedLines(lines, emitBreakTargetLabel(breakLabel, context), '  ')
    lines.push('}')

    return lines
  } finally {
    restoreVariableScope(context, variableScope)
  }
}

export function emitRuntimeStringVariableDeclaration(statement, expression, context: CFunctionContext) {
  const value = statementDeps(context).emitCValueExpression(expression, context)
  const lines: string[] = []
  pushAllLines(lines, value.lines)
  lines.push(`${constPrefix(statement.kind === 'const')}ccjs_string* ${statement.name} = (ccjs_string*)${value.expression}.as.ref;`)

  context.variables.set(statement.name, 'string')
  context.runtimeStrings.add(statement.name)

  return lines
}

export function emitStringScalarVariableDeclaration(statement: AnyNode, context: CFunctionContext, inferred: string): string[] | null {
  if (inferred !== 'string') {
    return null
  }

  const deps = statementDeps(context)

  if (context.boxedMutableCaptureDeclarations.has(statement)) {
    return emitBoxedRuntimeValueVariableDeclaration(statement, statement.init, context)
  }

  const runtimeString = deps.resolveRuntimeStringReference(statement.init, context)

  if (runtimeString != null) {
    context.runtimeStrings.add(statement.name)
    return [`${constPrefix(statement.kind === 'const')}ccjs_string* ${statement.name} = ${runtimeString};`]
  }

  const runtimeElement = deps.resolveRuntimeArrayIndex(statement.init, context)
  const forcedRuntimeStrings = context.forceRuntimeStringDeclarations

  if (forcedRuntimeStrings != null) {
    if (forcedRuntimeStrings.has(statement.name) && isRawStringLiteralExpression(statement.init)) {
      return emitRuntimeStringVariableDeclaration(statement, statement.init, context)
    }
  }

  if (deps.isRuntimeProducedStringExpression(statement.init, context)) {
    return emitRuntimeStringVariableDeclaration(statement, statement.init, context)
  }

  if (runtimeElement != null && runtimeElement.valueType === 'string') {
    return emitRuntimeStringVariableDeclaration(statement, statement.init, context)
  }

  return [`${constPrefix(statement.kind === 'const')}char* ${statement.name} = ${deps.emitStringExpression(statement.init, context)};`]
}

export function emitFunctionScalarVariableDeclaration(
  statement: AnyNode,
  context: CFunctionContext,
  inferred: string
): string[] | null {
  if (inferred !== 'function') {
    return null
  }

  const deps = statementDeps(context)
  let runtimeFunctionType: CFunctionType | null = null
  const callbackWrapper = context.callbackArrowWrappers.get(statement.init)

  if (callbackWrapper != null && callbackWrapper.kind === 'arrow') {
    runtimeFunctionType = normalizeFunctionType(statement.functionType)
  }

  context.variables.set(statement.name, 'function')
  if (runtimeFunctionType != null) {
    context.functionTypes.set(statement.name, runtimeFunctionType)
  } else {
    context.functionTypes.set(statement.name, statement.functionType)
  }

  if (isRuntimeFunctionType(statement.functionType) || runtimeFunctionType != null) {
    return deps.emitRuntimeCallbackVariableDeclaration(statement, context)
  }

  return [
    `${deps.emitFunctionPointerVariable(
      statement.name,
      statement.init,
      context,
      statement.kind === 'const',
      statement.functionType,
      statement.loc
    )};`
  ]
}

export function emitNumberBooleanScalarVariableDeclaration(statement: AnyNode, context: CFunctionContext, inferred: string): string[] {
  if ((inferred === 'number' || inferred === 'boolean') && context.boxedMutableCaptureDeclarations.has(statement)) {
    return emitBoxedScalarVariableDeclaration(statement, context)
  }

  if (!['number', 'boolean'].includes(inferred)) {
    context.diagnostics.push(
      diagnostic(
        cUnsupportedExpressionCode(inferred),
        'this expression is not supported by the current C backend slice',
        statement.loc
      )
    )
    return [`double ${statement.name} = 0;`]
  }

  const value = statementDeps(context).emitPreparedNumberExpression(statement.init, context)
  const lines: string[] = []
  pushAllLines(lines, value.lines)
  lines.push(`${constPrefix(statement.kind === 'const')}double ${statement.name} = ${value.expression};`)

  return lines
}

export function emitRuntimeValueVariableDeclaration(statement, expression, context: CFunctionContext) {
  const valueType = statementDeps(context).inferExpressionType(expression, context)
  const expectedTag = cRuntimeValueTag(valueType)
  let value: PreparedExpression
  let objectLiteralExpression = false

  if (valueType === 'object') {
    if (expression != null && expression.type === 'ObjectLiteral') {
      objectLiteralExpression = true
    }
  }

  if (objectLiteralExpression) {
    value = statementDeps(context).emitCObjectLiteralValueExpression(expression, context, statement.shape)
  } else {
    value = statementDeps(context).emitCValueExpression(expression, context)
  }

  registerOwnedValue(context, statement.name)
  registerRuntimeValueMetadata(statement.name, valueType, statement, expression, context)

  const lines: string[] = []
  pushAllLines(lines, value.lines)
  pushAllLines(lines, emitPrepareOwnedValueWrite(statement.name))
  lines.push(`${statement.name} = ${value.expression};`)
  lines.push(emitRuntimeValueCheck(statement.name, expectedTag, context))
  lines.push(`ccjs_retain(${statement.name});`)

  return lines
}

export function registerRuntimeValueMetadata(name, valueType, declaration, expression, context: CFunctionContext) {
  context.variables.set(name, valueType)

  if (valueType === 'object') {
    registerObjectShape(context, name, resolveRuntimeObjectShape(declaration, expression))
  } else if (valueType === 'array') {
    context.runtimeArrayElementTypes.set(name, resolveRuntimeArrayMetadataElementType(declaration, expression, context))
  } else if (valueType === 'map') {
    const mapType = resolveRuntimeMapType(expression, context)

    context.mapTypes.set(name, {
      key: resolveRuntimeMapMetadataKeyType(declaration, expression, mapType),
      value: resolveRuntimeMapMetadataValueType(declaration, expression, mapType)
    })
  } else if (valueType === 'set') {
    context.setElementTypes.set(name, resolveRuntimeSetMetadataElementType(declaration, expression, context))
  }
}

function resolveRuntimeObjectShape(declaration, expression): CObjectShape | null {
  if (declaration.shape != null) {
    return declaration.shape
  }

  if (expression != null && expression.shape != null) {
    return expression.shape
  }

  return null
}

function resolveRuntimeArrayMetadataElementType(declaration, expression, context: CFunctionContext): string {
  if (declaration.arrayElementType != null) {
    return declaration.arrayElementType
  }

  const resolvedElementType = resolveRuntimeArrayElementType(expression, context)

  if (resolvedElementType != null) {
    return resolvedElementType
  }

  if (expression != null && expression.arrayElementType != null) {
    return expression.arrayElementType
  }

  if (expression != null) {
    if (expression.fsRuntimeMethod === 'readDirDirents' || expression.fsRuntimeMethod === 'readDirDirentsSync') {
      return 'object'
    }
  }

  return 'unknown'
}

function resolveRuntimeMapMetadataKeyType(declaration, expression, mapType): string {
  if (declaration.mapKeyType != null) {
    return declaration.mapKeyType
  }

  if (mapType != null && mapType.key != null) {
    return mapType.key
  }

  if (expression != null && expression.mapKeyType != null) {
    return expression.mapKeyType
  }

  return 'unknown'
}

function resolveRuntimeMapMetadataValueType(declaration, expression, mapType): string {
  if (declaration.mapValueType != null) {
    return declaration.mapValueType
  }

  if (mapType != null && mapType.value != null) {
    return mapType.value
  }

  if (expression != null && expression.mapValueType != null) {
    return expression.mapValueType
  }

  return 'unknown'
}

function resolveRuntimeSetMetadataElementType(declaration, expression, context: CFunctionContext): string {
  if (declaration.setElementType != null) {
    return declaration.setElementType
  }

  const resolvedElementType = resolveRuntimeSetElementType(expression, context)

  if (resolvedElementType != null) {
    return resolvedElementType
  }

  if (expression != null && expression.setElementType != null) {
    return expression.setElementType
  }

  return 'unknown'
}

export function isRuntimeValueLocalExpression(expression, context: CFunctionContext) {
  const valueType = statementDeps(context).inferExpressionType(expression, context)

  return (
    valueType === 'bytes' ||
    valueType === 'object' ||
    valueType === 'array' ||
    valueType === 'map' ||
    valueType === 'set'
  )
}

export function emitBoxedScalarVariableDeclaration(statement, context: CFunctionContext) {
  const deps = statementDeps(context)
  const value = deps.emitPreparedNumberExpression(statement.init, context)
  const inferred = deps.inferExpressionType(statement.init, context)

  registerBoxedValue(context, statement.name, inferred)
  context.boxedVariables.add(statement.name)

  const lines: string[] = []
  pushAllLines(lines, value.lines)
  lines.push(`${statement.name} = ccjs_default_alloc(0, sizeof(double), _Alignof(double));`)
  lines.push(`if (${statement.name} == 0) ${deps.emitFailureStatement(context)}`)
  lines.push(`*${statement.name} = ${value.expression};`)

  return lines
}

export function emitBoxedRuntimeValueVariableDeclaration(statement, expression, context: CFunctionContext) {
  const deps = statementDeps(context)
  const valueType = deps.inferExpressionType(expression, context)
  const value = deps.emitCValueExpression(expression, context)
  let tag = 'CCJS_TAG_OBJECT'

  if (valueType === 'string') {
    tag = 'CCJS_TAG_STRING'
  }

  registerBoxedValue(context, statement.name, valueType)
  context.boxedVariables.add(statement.name)
  context.variables.set(statement.name, valueType)

  const lines: string[] = []
  pushAllLines(lines, value.lines)
  lines.push(`${statement.name} = ccjs_default_alloc(0, sizeof(ccjs_value), _Alignof(ccjs_value));`)
  lines.push(`if (${statement.name} == 0) ${deps.emitFailureStatement(context)}`)
  lines.push(`*${statement.name} = ${value.expression};`)
  lines.push(emitRuntimeTypeCheck(`(*${statement.name}).tag != ${tag} || (*${statement.name}).as.ref == 0`, context))
  lines.push(`ccjs_retain(*${statement.name});`)

  return lines
}

export function reportCCollectionHashability(valueType, subject, loc, context: CFunctionContext) {
  if (valueType == null || valueType === 'unknown' || isCCollectionHashableType(valueType)) {
    return
  }

  context.diagnostics.push(
    diagnostic('CCJS_C_COLLECTION', `${subject} must be hashable in the current C backend slice`, loc)
  )
}

function isCCollectionHashableType(valueType) {
  return valueType === 'number' || valueType === 'boolean' || valueType === 'string'
}

function emitCollectionVariableDeclaration(statement, context: CFunctionContext) {
  const deps = statementDeps(context)
  const collectionConstructor = deps.collectionConstructorName(statement.init)

  if (collectionConstructor == null) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_COLLECTION',
        'this collection constructor is not supported by the current C backend slice',
        statement.loc
      )
    )
    return [`double ${statement.name} = 0;`]
  }

  if (statement.init.args.length > 1) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_COLLECTION',
        'C collection constructors currently support at most one array literal iterable',
        statement.init.loc
      )
    )
  }

  registerOwnedValue(context, statement.name)

  if (collectionConstructor === 'Map') {
    const mapKeyType = stringOrUnknown(statement.mapKeyType)
    const mapValueType = stringOrUnknown(statement.mapValueType)
    context.variables.set(statement.name, 'map')
    context.mapTypes.set(statement.name, {
      key: mapKeyType,
      value: mapValueType
    })
    reportCCollectionHashability(statement.mapKeyType, 'Map keys', statement.loc, context)

    const lines: string[] = []
    pushAllLines(lines, emitPrepareOwnedValueWrite(statement.name))
    lines.push(emitStatusCheck(`ccjs_map_new(&ccjs_default_allocator, &${statement.name})`, context))

    pushAllLines(lines, emitMapConstructorEntries(statement.name, statement.init.args[0], context, statement.init.loc))

    return lines
  }

  context.variables.set(statement.name, 'set')
  context.setElementTypes.set(statement.name, stringOrUnknown(statement.setElementType))
  reportCCollectionHashability(statement.setElementType, 'Set values', statement.loc, context)

  const lines: string[] = []
  pushAllLines(lines, emitPrepareOwnedValueWrite(statement.name))
  lines.push(emitStatusCheck(`ccjs_set_new(&ccjs_default_allocator, &${statement.name})`, context))

  pushAllLines(lines, emitSetConstructorValues(statement.name, statement.init.args[0], context, statement.init.loc))

  return lines
}

function emitMapConstructorEntries(name, expression, context: CFunctionContext, loc) {
  const deps = statementDeps(context)

  if (expression == null) {
    return []
  }

  if (expression.type !== 'ArrayLiteral') {
    context.diagnostics.push(
      diagnostic(
	        'CCJS_C_COLLECTION',
	        'C Map constructor currently supports only array literal entries',
	        nodeLocOrFallback(expression, loc)
	      )
	    )
    return []
  }

  const lines: string[] = []

  for (const entry of expression.elements) {
    if (entry.type !== 'ArrayLiteral' || entry.elements.length !== 2) {
      context.diagnostics.push(
        diagnostic(
	        'CCJS_C_COLLECTION',
	        'C Map constructor entries must be [key, value] array literals',
	        nodeLocOrFallback(entry, loc)
	      )
	    )
      continue
    }

    const key = deps.emitCValueExpression(entry.elements[0], context)
    const value = deps.emitCValueExpression(entry.elements[1], context)
    reportCCollectionHashability(
	      deps.inferExpressionType(entry.elements[0], context),
	      'Map keys',
	      nodeLocOrFallback(entry.elements[0], nodeLocOrFallback(entry, loc)),
	      context
	    )

	    pushAllLines(lines, key.lines)
	    pushAllLines(lines, value.lines)
	    lines.push(emitStatusCheck(`ccjs_map_set(${name}, ${key.expression}, ${value.expression})`, context))
  }

  return lines
}

function emitSetConstructorValues(name, expression, context: CFunctionContext, loc) {
  const deps = statementDeps(context)

  if (expression == null) {
    return []
  }

  if (expression.type !== 'ArrayLiteral') {
    context.diagnostics.push(
      diagnostic(
	        'CCJS_C_COLLECTION',
	        'C Set constructor currently supports only array literal values',
	        nodeLocOrFallback(expression, loc)
	      )
	    )
    return []
  }

  const lines: string[] = []

	  for (const element of expression.elements) {
	    const value = deps.emitCValueExpression(element, context)
	    reportCCollectionHashability(deps.inferExpressionType(element, context), 'Set values', nodeLocOrFallback(element, loc), context)

	    pushAllLines(lines, value.lines)
	    lines.push(emitStatusCheck(`ccjs_set_add(${name}, ${value.expression})`, context))
	  }

  return lines
}

function emitDirentArrayIndexVariableDeclaration(statement, context: CFunctionContext) {
  const expression = statement.init

  if (expression == null) {
    return null
  }

  if (expression.type !== 'IndexExpression') {
    return null
  }

  if (
    expression.object.type !== 'Reference' ||
    expression.index.type !== 'NumberLiteral' ||
    expression.arrayElementDeclaredType !== 'fs.Dirent'
  ) {
    return null
  }

  const index = Number.parseInt(expression.index.value, 10)

  if (!Number.isInteger(index) || index < 0) {
    return null
  }

  const array = statementDeps(context).emitCValueExpression(expression.object, context)
  registerOwnedValue(context, statement.name)
  context.variables.set(statement.name, 'object')
  registerObjectShape(context, statement.name, expression.shape)

  const lines: string[] = []
  pushAllLines(lines, array.lines)
  pushAllLines(lines, emitPrepareOwnedValueWrite(statement.name))
  lines.push(emitStatusCheck(`ccjs_array_get(${array.expression}, ${index}, &${statement.name})`, context))
  lines.push(emitRuntimeValueCheck(statement.name, 'CCJS_TAG_OBJECT', context))
  lines.push(`ccjs_retain(${statement.name});`)

  return lines
}

function emitPreparedForInitializer(init, context: CFunctionContext) {
  if (init == null) {
    return {
      lines: [],
      expression: ''
    }
  }

  if (init.type === 'VariableDeclaration') {
    return emitPreparedForVariableDeclaration(init, context)
  }

  return emitPreparedForExpressionClause(init, context)
}

function emitPreparedForVariableDeclaration(statement, context: CFunctionContext) {
  const deps = statementDeps(context)
  const fetchCall = deps.emitPreparedFetchCallExpression(statement.init, context, {
    out: statement.name
  })

  if (fetchCall != null) {
    return {
      lines: fetchCall.lines,
      expression: ''
    }
  }

  const fsCall = deps.emitPreparedFsCallExpression(statement.init, context, {
    out: statement.name
  })

  if (fsCall != null) {
    return {
      lines: fsCall.lines,
      expression: ''
    }
  }

  const promiseConstructor = deps.emitPreparedPromiseConstructorExpression(statement.init, context, {
    out: statement.name
  })

  if (promiseConstructor != null) {
    return {
      lines: promiseConstructor.lines,
      expression: ''
    }
  }

  const promise = deps.emitPreparedPromiseStaticExpression(statement.init, context, {
    out: statement.name
  })

  if (promise != null) {
    return {
      lines: promise.lines,
      expression: ''
    }
  }

  const promiseCall = deps.emitPreparedPromiseReturningCallExpression(statement.init, context, {
    out: statement.name
  })

  if (promiseCall != null) {
    return {
      lines: promiseCall.lines,
      expression: ''
    }
  }

  if (deps.isCollectionConstructorExpression(statement.init)) {
    return {
      lines: emitCollectionVariableDeclaration(statement, context),
      expression: ''
    }
  }

  const arrayMapCall = deps.emitPreparedArrayMapCallExpression(statement.init, context)

  if (arrayMapCall != null) {
    return {
      lines: deps.emitArrayMapVariableDeclaration(statement, arrayMapCall, context),
      expression: ''
    }
  }

  const arrayFilterCall = deps.emitPreparedArrayFilterCallExpression(statement.init, context)

  if (arrayFilterCall != null) {
    return {
      lines: deps.emitArrayFilterVariableDeclaration(statement, arrayFilterCall, context),
      expression: ''
    }
  }

  const arraySortCall = deps.emitPreparedArraySortCallExpression(statement.init, context)

  if (arraySortCall != null) {
    return {
      lines: deps.emitArraySortVariableDeclaration(statement, arraySortCall, context),
      expression: ''
    }
  }

  if (statement.nullable === true && isRuntimeNullableType(statement.valueType)) {
    return {
      lines: emitNullableRuntimeValueVariableDeclaration(statement, context),
      expression: ''
    }
  }

  if (deps.isErrorConstructorExpression(statement.init)) {
    return {
      lines: deps.emitErrorObjectVariableDeclaration(statement, context),
      expression: ''
    }
  }

  if (deps.isClassConstructorExpression(statement.init, context)) {
    return {
      lines: deps.emitClassObjectVariableDeclaration(statement, context),
      expression: ''
    }
  }

  if (statement.init?.type === 'ObjectLiteral') {
    return {
      lines: deps.emitObjectVariableDeclaration(statement, context),
      expression: ''
    }
  }

  if (statement.init?.type === 'ArrayLiteral') {
    return {
      lines: deps.emitArrayVariableDeclaration(statement, context),
      expression: ''
    }
  }

  if (deps.isMemberAccessExpression(statement.init)) {
    const member = deps.resolveKnownObjectMember(statement.init, context)

    if (member != null) {
      return {
        lines: deps.emitKnownObjectMemberVariableDeclaration(statement, member, context),
        expression: ''
      }
    }
  }

  if (deps.isIndexAccessExpression(statement.init)) {
    const element = deps.resolveKnownArrayIndex(statement.init, context)

    if (element != null) {
      return {
        lines: deps.emitKnownArrayIndexVariableDeclaration(statement, element, context),
        expression: ''
      }
    }

    const field = deps.resolveKnownObjectIndex(statement.init, context)

    if (field != null) {
      return {
        lines: deps.emitDynamicObjectMemberVariableDeclaration(statement, field, context),
        expression: ''
      }
    }
  }

  if (deps.isRuntimeProducedStringExpression(statement.init, context)) {
    return {
      lines: emitRuntimeStringVariableDeclaration(statement, statement.init, context),
      expression: ''
    }
  }

  if (isRuntimeValueLocalExpression(statement.init, context)) {
    return {
      lines: emitRuntimeValueVariableDeclaration(statement, statement.init, context),
      expression: ''
    }
  }

  const inferred = deps.inferExpressionType(statement.init, context)
  context.variables.set(statement.name, inferred)

  if (inferred === 'string') {
    if (context.boxedMutableCaptureDeclarations.has(statement)) {
      return {
        lines: emitBoxedRuntimeValueVariableDeclaration(statement, statement.init, context),
        expression: ''
      }
    }

    const runtimeString = deps.resolveRuntimeStringReference(statement.init, context)

    if (runtimeString != null) {
      context.runtimeStrings.add(statement.name)
      return {
        lines: [],
        expression: `${statement.kind === 'const' ? 'const ' : ''}ccjs_string* ${statement.name} = ${runtimeString}`
      }
    }

    if (deps.isRuntimeProducedStringExpression(statement.init, context)) {
      return {
        lines: emitRuntimeStringVariableDeclaration(statement, statement.init, context),
        expression: ''
      }
    }

    return {
      lines: [],
      expression: `${statement.kind === 'const' ? 'const ' : ''}char* ${statement.name} = ${deps.emitStringExpression(
        statement.init,
        context
      )}`
    }
  }

  if (inferred === 'function') {
    context.variables.set(statement.name, 'function')
    context.functionTypes.set(statement.name, statement.functionType)

    if (isRuntimeFunctionType(statement.functionType)) {
      return {
        lines: deps.emitRuntimeCallbackVariableDeclaration(statement, context),
        expression: ''
      }
    }

    return {
      lines: [],
      expression: deps.emitFunctionPointerVariable(
        statement.name,
        statement.init,
        context,
        statement.kind === 'const',
        statement.functionType,
        statement.loc
      )
    }
  }

  if (!['number', 'boolean'].includes(inferred)) {
    context.diagnostics.push(
      diagnostic(
        cUnsupportedVariableDeclarationCode(statement, inferred),
        'this expression is not supported by the current C backend slice',
        statement.loc
      )
    )

    return {
      lines: [],
      expression: `double ${statement.name} = 0`
    }
  }

  const value = deps.emitPreparedNumberExpression(statement.init, context)

  return {
    lines: value.lines,
    expression: `${statement.kind === 'const' ? 'const ' : ''}double ${statement.name} = ${value.expression}`
  }
}

function emitPreparedForExpressionClause(expression, context: CFunctionContext) {
  if (expression == null) {
    return {
      lines: [],
      expression: ''
    }
  }

  return statementDeps(context).emitPreparedNumberExpression(expression, context)
}

export function emitForOfStatement(statement, context: CFunctionContext) {
  const setup: string[] = []
  let array: KnownForOfArray | null = statementDeps(context).resolveKnownForOfArray(statement.iterable, context)
  let runtimeArray: RuntimeForOfArray | null = null
  let runtimeMap: RuntimeForOfMap | null = null
  let runtimeSet: RuntimeForOfSet | null = null

  if (array == null) {
    const iterable = statement.iterable

    if (iterable != null && iterable.type === 'ArrayLiteral') {
      const name = nextCName(context, 'ccjs_for_array')
      pushAllLines(
        setup,
        statementDeps(context).emitArrayVariableDeclaration(
          {
            kind: 'const',
            name,
            init: iterable
          },
          context
        )
      )
      array = statementDeps(context).resolveKnownForOfArray(
        {
          type: 'Reference',
          path: [name]
        },
        context
      )
    }
  }

  if (array == null) {
    runtimeArray = statementDeps(context).resolveRuntimeForOfArray(statement.iterable, context)
  }

  if (array == null && runtimeArray == null) {
    runtimeMap = statementDeps(context).resolveRuntimeForOfMap(statement.iterable, context)
  }

  if (runtimeMap != null) {
    return emitRuntimeMapForOfStatement(statement, runtimeMap, context)
  }

  if (array == null && runtimeArray == null) {
    runtimeSet = statementDeps(context).resolveRuntimeForOfSet(statement.iterable, context)
  }

  if (runtimeSet != null) {
    return emitRuntimeSetForOfStatement(statement, runtimeSet, context)
  }

  if (array == null && runtimeArray == null) {
    context.diagnostics.push(
      diagnostic('CCJS_C_FOR_OF', 'C for...of currently supports arrays, Map values and Set values', statement.loc)
    )
    return []
  }

  let elementType = 'unknown'

  if (runtimeArray != null) {
    elementType = runtimeArray.elementType
  } else if (array != null) {
    elementType = statementDeps(context).resolveForOfElementType(array.elements)
  }

  if (!['number', 'boolean', 'string'].includes(elementType)) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_FOR_OF',
        'C for...of currently supports only uniform number/boolean/string arrays',
        statement.loc
      )
    )
    return []
  }

  const index = nextCName(context, 'ccjs_for_index')
  const value = nextCName(context, 'ccjs_for_value')
  let length = '0'
  let arrayName = ''

  if (runtimeArray != null) {
    length = nextCName(context, 'ccjs_for_length')
    arrayName = runtimeArray.name
  } else if (array != null) {
    length = `${array.elements.length}`
    arrayName = array.name
  }

  const breakLabel = nextCName(context, 'ccjs_break')
  const continueLabel = nextCName(context, 'ccjs_continue')
  let loopValue = `${value}.as.number`

  if (elementType === 'boolean') {
    loopValue = `((double)(${value}.as.boolean ? 1 : 0))`
  }

  registerOwnedValue(context, value)

  const variableScope = pushVariableScope(context)

  try {
    context.variables.set(statement.name, elementType)
    if (elementType === 'string') {
      context.runtimeStrings.add(statement.name)
    }
    const body = withBreakTarget(context, breakLabel, false, () =>
      withContinueTarget(context, continueLabel, false, () => emitScopedStatementBody(statement.body, context, []))
    )
    let declaration = `double ${statement.name} = ${loopValue};`
    const checks: string[] = []

    if (elementType === 'string') {
      declaration = `ccjs_string* ${statement.name} = (ccjs_string*)${value}.as.ref;`
      checks.push(emitRuntimeTypeCheck(`${value}.tag != CCJS_TAG_STRING || ${value}.as.ref == 0`, context))
    }

    const getElementStatus = emitStatusCheck(`ccjs_array_get(${arrayName}, ${index}, &${value})`, context)
    const lines: string[] = []
    pushAllLines(lines, setup)

    if (runtimeArray != null) {
      pushAllLines(lines, runtimeArray.lines)
      lines.push(`size_t ${length} = 0;`)
      lines.push(emitStatusCheck(`ccjs_array_len(${arrayName}, &${length})`, context))
    }

    lines.push(`for (size_t ${index} = 0; ${index} < ${length}; ${index} += 1) {`)
    pushIndentedLines(lines, emitPrepareOwnedValueWrite(value), '  ')
    lines.push(`  ${getElementStatus}`)
    pushIndentedLines(lines, checks, '  ')
    lines.push(`  ${declaration}`)
    pushIndentedLines(lines, body, '  ')
    pushAllLines(lines, emitContinueTargetLabel(continueLabel, context))
    lines.push('}')
    pushAllLines(lines, emitBreakTargetLabel(breakLabel, context))
    pushAllLines(lines, emitPrepareOwnedValueWrite(value))

    return lines
  } finally {
    restoreVariableScope(context, variableScope)
  }
}

function emitRuntimeMapForOfStatement(statement, runtimeMap, context: CFunctionContext) {
  const keyType = stringOrUnknown(runtimeMap.keyType)
  const valueType = stringOrUnknown(runtimeMap.valueType)

  if (!['number', 'boolean', 'string'].includes(keyType) || !['number', 'boolean', 'string'].includes(valueType)) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_FOR_OF',
        'C for...of currently supports only Map entries with number/boolean/string keys and values',
        statement.loc
      )
    )
    return []
  }

  const index = nextCName(context, 'ccjs_for_map_index')
  const map = nextCName(context, 'ccjs_for_map')
  const shapeName = nextCName(context, 'ccjs_shape_map_entry')
  const fieldsName = `${shapeName}_fields`
  const breakLabel = nextCName(context, 'ccjs_break')
  const continueLabel = nextCName(context, 'ccjs_continue')
	  const fields = [
	    {
	      name: 'key',
	      readonlyField: true,
	      valueType: keyType
	    },
	    {
	      name: 'value',
	      readonlyField: true,
	      valueType: valueType
	    }
	  ]

  registerOwnedValue(context, statement.name)

  const variableScope = pushVariableScope(context)

  try {
    context.variables.set(statement.name, 'object')
    context.objectShapes.set(statement.name, fields)
    const body = withBreakTarget(context, breakLabel, false, () =>
      withContinueTarget(context, continueLabel, false, () => emitScopedStatementBody(statement.body, context, []))
    )
    const createEntryStatus = emitStatusCheck(
      `ccjs_object_new(&ccjs_default_allocator, &${shapeName}, &${statement.name})`,
      context
    )
    const initKeyStatus = emitStatusCheck(
      `ccjs_object_init_known(${statement.name}, 0, ${map}->entries[${index}].key)`,
      context
    )
    const initValueStatus = emitStatusCheck(
      `ccjs_object_init_known(${statement.name}, 1, ${map}->entries[${index}].value)`,
      context
    )

    const lines: string[] = []
    lines.push(`static const ccjs_field_info ${fieldsName}[] = {`)
    lines.push('  { "key", CCJS_FIELD_READONLY },')
    lines.push('  { "value", CCJS_FIELD_READONLY },')
    lines.push('};')
    lines.push(`static const ccjs_shape ${shapeName} = {`)
    lines.push('  2,')
    lines.push(`  ${fieldsName}`)
    lines.push('};')
    pushAllLines(lines, runtimeMap.lines)
    lines.push(`ccjs_map* ${map} = (ccjs_map*)${runtimeMap.name}.as.ref;`)
    lines.push(`for (size_t ${index} = 0; ${index} < ${map}->cap; ${index} += 1) {`)
    lines.push(`  if (${map}->entries[${index}].state != CCJS_MAP_SLOT_OCCUPIED) continue;`)
    pushIndentedLines(lines, emitPrepareOwnedValueWrite(statement.name), '  ')
    lines.push(`  ${createEntryStatus}`)
    lines.push(`  ${initKeyStatus}`)
    lines.push(`  ${initValueStatus}`)
    pushIndentedLines(lines, body, '  ')
    pushAllLines(lines, emitContinueTargetLabel(continueLabel, context))
    lines.push('}')
    pushAllLines(lines, emitBreakTargetLabel(breakLabel, context))
    pushAllLines(lines, emitPrepareOwnedValueWrite(statement.name))

    return lines
  } finally {
    restoreVariableScope(context, variableScope)
  }
}

function emitRuntimeSetForOfStatement(statement, runtimeSet, context: CFunctionContext) {
  const elementType = runtimeSet.elementType

  if (!['number', 'boolean', 'string'].includes(elementType)) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_FOR_OF',
        'C for...of currently supports only uniform number/boolean/string Set values',
        statement.loc
      )
    )
    return []
  }

  const index = nextCName(context, 'ccjs_for_set_index')
  const set = nextCName(context, 'ccjs_for_set')
  const value = nextCName(context, 'ccjs_for_value')
  const breakLabel = nextCName(context, 'ccjs_break')
  const continueLabel = nextCName(context, 'ccjs_continue')
  let loopValue = `${value}.as.number`

  if (elementType === 'boolean') {
    loopValue = `((double)(${value}.as.boolean ? 1 : 0))`
  }

  registerOwnedValue(context, value)

  const variableScope = pushVariableScope(context)

  try {
    context.variables.set(statement.name, elementType)
    if (elementType === 'string') {
      context.runtimeStrings.add(statement.name)
    }
    const body = withBreakTarget(context, breakLabel, false, () =>
      withContinueTarget(context, continueLabel, false, () => emitScopedStatementBody(statement.body, context, []))
    )
    let declaration = `double ${statement.name} = ${loopValue};`
    const checks: string[] = []

    if (elementType === 'string') {
      declaration = `ccjs_string* ${statement.name} = (ccjs_string*)${value}.as.ref;`
      checks.push(emitRuntimeTypeCheck(`${value}.tag != CCJS_TAG_STRING || ${value}.as.ref == 0`, context))
    } else if (elementType === 'boolean') {
      checks.push(emitRuntimeTypeCheck(`${value}.tag != CCJS_TAG_BOOL`, context))
    } else {
      checks.push(emitRuntimeTypeCheck(`${value}.tag != CCJS_TAG_NUMBER`, context))
    }

    const lines: string[] = []
    pushAllLines(lines, runtimeSet.lines)
    lines.push(`ccjs_set* ${set} = (ccjs_set*)${runtimeSet.name}.as.ref;`)
    lines.push(`for (size_t ${index} = 0; ${index} < ${set}->cap; ${index} += 1) {`)
    lines.push(`  if (${set}->entries[${index}].state != CCJS_SET_SLOT_OCCUPIED) continue;`)
    pushIndentedLines(lines, emitPrepareOwnedValueWrite(value), '  ')
    lines.push(`  ${value} = ${set}->entries[${index}].value;`)
    lines.push(`  ccjs_retain(${value});`)
    pushIndentedLines(lines, checks, '  ')
    lines.push(`  ${declaration}`)
    pushIndentedLines(lines, body, '  ')
    pushAllLines(lines, emitContinueTargetLabel(continueLabel, context))
    lines.push('}')
    pushAllLines(lines, emitBreakTargetLabel(breakLabel, context))
    pushAllLines(lines, emitPrepareOwnedValueWrite(value))

    return lines
  } finally {
    restoreVariableScope(context, variableScope)
  }
}

export function emitSwitchStatement(statement, context: CFunctionContext) {
  const discriminant = statementDeps(context).emitPreparedNumberExpression(statement.discriminant, context)
  const breakLabel = nextCName(context, 'ccjs_break')
  const lines: string[] = []
  pushAllLines(lines, discriminant.lines)
  lines.push(`switch ((int)${discriminant.expression}) {`)

  for (const item of statement.cases) {
    if (item.test == null) {
      lines.push('  default: {')
    } else {
      lines.push(`  case ${emitSwitchCaseLabel(item.test, context)}: {`)
    }

    const body = withBreakTarget(context, breakLabel, false, () => emitScopedStatementList(item.consequent, context))
    pushIndentedLines(lines, body, '    ')
    lines.push('  }')
  }

  lines.push('}')
  pushAllLines(lines, emitBreakTargetLabel(breakLabel, context))

  return lines
}

function emitSwitchCaseLabel(expression, context: CFunctionContext) {
  if (expression?.type === 'NumberLiteral') {
    return `(int)${expression.value}`
  }

  if (expression?.type === 'BooleanLiteral') {
    return `(int)${expression.value ? '1' : '0'}`
  }

  if (
    expression?.type === 'UnaryExpression' &&
    expression.argument.type === 'NumberLiteral' &&
    ['+', '-'].includes(expression.operator)
  ) {
    return `(int)(${expression.operator}${expression.argument.value})`
  }

  context.diagnostics.push(
    diagnostic(
      'CCJS_C_SWITCH_CASE',
      'C switch case labels must be numeric or boolean literals in the current backend slice',
      expression?.loc
    )
  )

  return '0'
}

export function emitTryStatement(statement, context: CFunctionContext) {
  if (
    statement.handler != null &&
    currentErrorTarget(context) != null &&
    containsAwaitExpression(statement.block)
  ) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_ASYNC',
        'nested async try/catch state-machine lowering is not supported by the current C backend slice',
        statement.loc
      )
    )
  }

  registerErrorChannel(context)

  const id = nextCName(context, 'ccjs_try')
  let catchLabel: string | null = null
  let finallyLabel: string | null = null

  if (statement.handler != null) {
    catchLabel = `${id}_catch`
  }

  if (statement.finalizer != null) {
    finallyLabel = `${id}_finally`
  }

  const endLabel = `${id}_end`
  let throwTarget = catchLabel

  if (throwTarget == null) {
    throwTarget = finallyLabel
  }

  const outerReturnTarget = currentReturnTarget(context)
  const outerBreakTarget = currentBreakTarget(context)
  const outerContinueTarget = currentContinueTarget(context)
  const lines = ['{']
  const tryBody = withErrorTarget(context, throwTarget, () =>
    withFinallyFlowTarget(context, finallyLabel, () =>
      emitScopedStatementBody(statement.block, context, [])
    )
  )

  pushIndentedLines(lines, tryBody, '  ')
  if (finallyLabel != null) {
    lines.push(`  goto ${finallyLabel};`)
  } else {
    lines.push(`  goto ${endLabel};`)
  }

  if (statement.handler != null && catchLabel != null) {
    const catchValueType = statementDeps(context).inferCatchBindingValueType(statement, context)
    const catchBody = withFinallyFlowTarget(context, finallyLabel, () => {
      const variableScope = pushVariableScope(context)

      try {
        const body: string[] = []

        if (statement.handler.param != null) {
          if (catchValueType === 'object') {
            context.variables.set(statement.handler.param, 'object')
            statementDeps(context).registerErrorObjectShape(context, statement.handler.param)
            body.push(`ccjs_value ${statement.handler.param} = ccjs_error;`)
          } else {
            context.variables.set(statement.handler.param, 'string')
            context.runtimeStrings.add(statement.handler.param)
            body.push(`ccjs_string* ${statement.handler.param} = (ccjs_string*)ccjs_error.as.ref;`)
          }
        }

        pushAllLines(body, emitStatementBody(statement.handler.body, context))

        return body
      } finally {
        restoreVariableScope(context, variableScope)
      }
    })

    lines.push(`${catchLabel}:`)
    lines.push(
      `  if (${emitCatchBindingTypeCheck(catchValueType)}) ${statementDeps(context).emitFailureStatement(context)}`
    )
    lines.push('  ccjs_error_active = 0;')
    lines.push('  {')
    pushIndentedLines(lines, catchBody, '    ')
    lines.push('  }')
    lines.push('  ccjs_release(ccjs_error);')
    lines.push('  ccjs_error = ccjs_undefined_value();')
  }

  if (statement.finalizer != null && finallyLabel != null) {
    const outerThrowTarget = currentErrorTarget(context)
    let outerBreakLabel: string | null = null
    let outerBreakThroughFinally = false
    let outerContinueLabel: string | null = null
    let outerContinueThroughFinally = false

    if (outerBreakTarget != null) {
      outerBreakLabel = outerBreakTarget.label
      outerBreakThroughFinally = outerBreakTarget.throughFinally === true
    }

    if (outerContinueTarget != null) {
      outerContinueLabel = outerContinueTarget.label
      outerContinueThroughFinally = outerContinueTarget.throughFinally === true
    }

    const finalizerBody = withErrorTarget(context, outerThrowTarget, () =>
      withReturnTarget(context, outerReturnTarget, () =>
        withBreakTarget(context, outerBreakLabel, outerBreakThroughFinally, () =>
          withContinueTarget(
            context,
            outerContinueLabel,
            outerContinueThroughFinally,
            () => emitScopedStatementBody(statement.finalizer, context, [])
          )
        )
      )
    )

    lines.push(`${finallyLabel}:`)
    pushIndentedLines(lines, finalizerBody, '  ')

    if (outerThrowTarget != null) {
      lines.push(`  if (ccjs_error_active) goto ${outerThrowTarget};`)
    } else {
      lines.push(`  if (ccjs_error_active) ${statementDeps(context).emitFailureStatement(context)}`)
    }

    if (context.returnFlowUsed) {
      if (outerReturnTarget != null) {
        lines.push(`  if (ccjs_return_active) goto ${outerReturnTarget};`)
      } else {
        lines.push(`  if (ccjs_return_active) ${emitReturnCleanupStatement(context)}`)
      }
    }

    if (context.breakFlowUsed && outerBreakTarget != null) {
      lines.push(`  if (ccjs_break_active) goto ${outerBreakTarget.label};`)
    }

    if (context.continueFlowUsed && outerContinueTarget != null) {
      lines.push(`  if (ccjs_continue_active) goto ${outerContinueTarget.label};`)
    }
  }

  lines.push(`${endLabel}:`)
  lines.push('  ;')
  lines.push('}')

  return lines
}

export function emitThrowStatement(statement, context: CFunctionContext) {
  const target = currentErrorTarget(context)

  if (target == null && !context.throwingFunction) {
    context.diagnostics.push(
      diagnostic('CCJS_C_THROW', 'uncaught throw is not supported by the current C backend slice', statement.loc)
    )
    return []
  }

  const isErrorObject = statementDeps(context).isErrorValueExpression(statement.argument, context)

  if (statementDeps(context).inferExpressionType(statement.argument, context) !== 'string' && !isErrorObject) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_THROW',
        'C throw currently supports only string values and lightweight Error objects in local try/catch regions',
        statement.loc
      )
    )
    return []
  }

  registerErrorChannel(context)

  const value = statementDeps(context).emitCValueExpression(statement.argument, context)
  const lines: string[] = []
  pushAllLines(lines, value.lines)
  pushAllLines(lines, emitPrepareOwnedValueWrite('ccjs_error'))
  lines.push(`ccjs_error = ${value.expression};`)

  let typeCheck = 'ccjs_error.tag != CCJS_TAG_STRING || ccjs_error.as.ref == 0'

  if (isErrorObject) {
    typeCheck = 'ccjs_error.tag != CCJS_TAG_OBJECT || ccjs_error.as.ref == 0'
  }

  lines.push(emitRuntimeTypeCheck(typeCheck, context))
  lines.push('ccjs_retain(ccjs_error);')

  if (target == null) {
    lines.push('ccjs_status_result = CCJS_ERR_THROW;')
  }

  lines.push('ccjs_error_active = 1;')

  if (target != null) {
    lines.push(`goto ${target};`)
  } else {
    lines.push('goto ccjs_cleanup;')
  }

  return lines
}

export function emitReturnStatement(statement, context: CFunctionContext) {
  const argument = normalizeCAsyncReturnArgument(statement.argument, context, statement.loc)
  let returnStatement = statement

  if (argument !== statement.argument) {
    returnStatement = {
      type: statement.type,
      argument,
      loc: statement.loc
    }
  }

  if (isRuntimeCallbackReturnContext(context)) {
    return emitRuntimeCallbackReturnStatement(returnStatement, context)
  }

  if (context.returnType === 'promise') {
    return emitPromiseReturnStatement(returnStatement, context)
  }

  if (context.returnNullable === true && isNullableScalarType(context.returnType)) {
    return emitNullableScalarReturnStatement(returnStatement, context)
  }

  if (isManagedRuntimeReturnType(context.returnType)) {
    return emitRuntimeValueReturnStatement(returnStatement, context)
  }

  if (context.returnType !== 'void') {
    let value: PreparedExpression = {
      lines: [],
      expression: '0'
    }

    if (argument != null) {
      value = statementDeps(context).emitPreparedNumberExpression(argument, context)
    }

    const lines: string[] = []
    pushAllLines(lines, value.lines)
    lines.push(`ccjs_return = ${value.expression};`)
    pushAllLines(lines, emitReturnJump(context))

    return lines
  }

  let value: PreparedExpression | null = null

  if (argument != null && argument.type === 'AwaitExpression') {
    value = statementDeps(context).emitCAwaitValueExpression(argument, context)
  }

  if (argument == null || context.returnType === 'void') {
    if (context.cleanupEnabled) {
      const lines: string[] = []

      if (value != null) {
        pushAllLines(lines, value.lines)
      }

      pushAllLines(lines, emitReturnJump(context))

      return lines
    }

    return ['return;']
  }

  return [`return ${statementDeps(context).emitCExpression(argument, context)};`]
}

export function emitVariableDeclarationStatement(statement, context: CFunctionContext) {
  const deps = statementDeps(context)
  const dgramSocket = deps.emitDgramSocketVariableDeclaration(statement, context)

  if (dgramSocket != null) {
    return dgramSocket
  }

  const dgramNumber = deps.emitDgramNumberVariableDeclaration(statement, context)

  if (dgramNumber != null) {
    return dgramNumber
  }

  const dgramAddress = deps.emitDgramAddressVariableDeclaration(statement, context)

  if (dgramAddress != null) {
    return dgramAddress
  }

  const httpServer = deps.emitHttpServerVariableDeclaration(statement, context)

  if (httpServer != null) {
    return httpServer
  }

  const netServer = deps.emitNetServerVariableDeclaration(statement, context)

  if (netServer != null) {
    return netServer
  }

  const netSocket = deps.emitNetSocketVariableDeclaration(statement, context)

  if (netSocket != null) {
    return netSocket
  }

  const netAddress = deps.emitNetAddressVariableDeclaration(statement, context)

  if (netAddress != null) {
    return netAddress
  }

  const netAddressMember = deps.emitNetAddressMemberVariableDeclaration(statement, context)

  if (netAddressMember != null) {
    return netAddressMember
  }

  const netNumber = deps.emitNetNumberVariableDeclaration(statement, context)

  if (netNumber != null) {
    return netNumber
  }

  const fetchAbortController = deps.emitFetchAbortControllerVariableDeclaration(statement, context)

  if (fetchAbortController != null) {
    return fetchAbortController
  }

  const childProcessObject = deps.emitPreparedChildProcessCallExpression(statement.init, context, {
    out: statement.name
  })

  if (childProcessObject != null && statement.init?.childProcessRuntimeMethod === 'spawnSync') {
    return childProcessObject.lines
  }

  const pathObject = deps.emitPreparedPathObjectCallExpression(statement.init, context, {
    out: statement.name
  })

  if (pathObject != null) {
    return pathObject.lines
  }

  const urlObject = deps.emitPreparedUrlObjectExpression(statement.init, context, {
    out: statement.name
  })

  if (urlObject != null) {
    return urlObject.lines
  }

  const urlSearchParamsObject = deps.emitPreparedUrlSearchParamsObjectExpression(statement.init, context, {
    out: statement.name
  })

  if (urlSearchParamsObject != null) {
    return urlSearchParamsObject.lines
  }

  const asyncPromiseCall = deps.emitPreparedAsyncFunctionPromiseCallExpression(statement.init, context, {
    out: statement.name
  })

  if (asyncPromiseCall != null) {
    return asyncPromiseCall.lines
  }

  const promiseMethod = deps.emitPreparedPromiseMethodExpression(statement.init, context, {
    out: statement.name
  })

  if (promiseMethod != null) {
    return promiseMethod.lines
  }

  const fetchCall = deps.emitPreparedFetchCallExpression(statement.init, context, {
    out: statement.name
  })

  if (fetchCall != null) {
    return fetchCall.lines
  }

  const fsCall = deps.emitPreparedFsCallExpression(statement.init, context, {
    out: statement.name
  })

  if (fsCall != null) {
    return fsCall.lines
  }

  const promiseConstructor = deps.emitPreparedPromiseConstructorExpression(statement.init, context, {
    out: statement.name
  })

  if (promiseConstructor != null) {
    return promiseConstructor.lines
  }

  const promise = deps.emitPreparedPromiseStaticExpression(statement.init, context, {
    out: statement.name
  })

  if (promise != null) {
    return promise.lines
  }

  const promiseCall = deps.emitPreparedPromiseReturningCallExpression(statement.init, context, {
    out: statement.name
  })

  if (promiseCall != null) {
    return promiseCall.lines
  }

  if (deps.isCollectionConstructorExpression(statement.init)) {
    return emitCollectionVariableDeclaration(statement, context)
  }

  const arrayMapCall = deps.emitPreparedArrayMapCallExpression(statement.init, context)

  if (arrayMapCall != null) {
    return deps.emitArrayMapVariableDeclaration(statement, arrayMapCall, context)
  }

  const arrayFilterCall = deps.emitPreparedArrayFilterCallExpression(statement.init, context)

  if (arrayFilterCall != null) {
    return deps.emitArrayFilterVariableDeclaration(statement, arrayFilterCall, context)
  }

  const arraySortCall = deps.emitPreparedArraySortCallExpression(statement.init, context)

  if (arraySortCall != null) {
    return deps.emitArraySortVariableDeclaration(statement, arraySortCall, context)
  }

  const fetchHeadersCall = deps.emitPreparedFetchHeadersCallExpression(statement.init, context, {
    out: statement.name
  })

  if (fetchHeadersCall != null && statement.valueType === 'boolean') {
    context.variables.set(statement.name, 'boolean')
    return fetchHeadersCall.lines
  }

  if (statement.nullable === true && isRuntimeNullableType(statement.valueType)) {
    return emitNullableRuntimeValueVariableDeclaration(statement, context)
  }

  if (deps.isErrorConstructorExpression(statement.init)) {
    return deps.emitErrorObjectVariableDeclaration(statement, context)
  }

  if (deps.isClassConstructorExpression(statement.init, context)) {
    return deps.emitClassObjectVariableDeclaration(statement, context)
  }

  const jsonParseDeclaration = deps.emitJsonParseVariableDeclaration(statement, context)

  if (jsonParseDeclaration != null) {
    return jsonParseDeclaration
  }

  if (statement.init?.type === 'ObjectLiteral') {
    if (context.boxedMutableCaptureDeclarations.has(statement)) {
      return deps.emitBoxedObjectVariableDeclaration(statement, context)
    }

    return deps.emitObjectVariableDeclaration(statement, context)
  }

  if (statement.init?.type === 'ArrayLiteral') {
    return deps.emitArrayVariableDeclaration(statement, context)
  }

  if (deps.isMemberAccessExpression(statement.init)) {
    const member = deps.resolveKnownObjectMember(statement.init, context)

    if (member != null) {
      return deps.emitKnownObjectMemberVariableDeclaration(statement, member, context)
    }
  }

  if (deps.isIndexAccessExpression(statement.init)) {
    const direntElement = emitDirentArrayIndexVariableDeclaration(statement, context)

    if (direntElement != null) {
      return direntElement
    }

    const element = deps.resolveKnownArrayIndex(statement.init, context)

    if (element != null) {
      return deps.emitKnownArrayIndexVariableDeclaration(statement, element, context)
    }

    const field = deps.resolveKnownObjectIndex(statement.init, context)

    if (field != null) {
      return deps.emitDynamicObjectMemberVariableDeclaration(statement, field, context)
    }
  }

  if (isRuntimeValueLocalExpression(statement.init, context)) {
    return emitRuntimeValueVariableDeclaration(statement, statement.init, context)
  }

  if (deps.isIndexAccessExpression(statement.init)) {
    const runtimeElement = deps.resolveRuntimeArrayIndex(statement.init, context)

    if (runtimeElement?.valueType === 'object') {
      return emitRuntimeValueVariableDeclaration(statement, statement.init, context)
    }
  }

  if (
    statement.init?.type === 'CallExpression' &&
    statement.nullable !== true &&
    deps.inferExpressionType(statement.init, context) === 'string'
  ) {
    return emitRuntimeStringVariableDeclaration(statement, statement.init, context)
  }

  return deps.emitScalarVariableDeclaration(statement, context)
}

export function emitExpressionStatement(statement, context: CFunctionContext) {
  const deps = statementDeps(context)

  if (deps.isConsoleLog(statement.expression)) {
    return deps.emitConsoleLogStatement(statement.expression.callee.property, statement.expression.args, context)
  }

  const promiseSettlement = deps.emitPromiseConstructorSettlementCall(statement.expression, context)

  if (promiseSettlement != null) {
    return promiseSettlement
  }

  if (statement.expression.type === 'CallExpression') {
    const dgramSocketCall = deps.emitDgramSocketCallStatement(statement.expression, context)

    if (dgramSocketCall != null) {
      return dgramSocketCall
    }

    const httpServerCall = deps.emitHttpServerCallStatement(statement.expression, context)

    if (httpServerCall != null) {
      return httpServerCall
    }

    const netServerCall = deps.emitNetServerCallStatement(statement.expression, context)

    if (netServerCall != null) {
      return netServerCall
    }

    const netSocketCall = deps.emitNetSocketCallStatement(statement.expression, context)

    if (netSocketCall != null) {
      return netSocketCall
    }

    const arrayPopCall = deps.emitPreparedArrayPopCallExpression(statement.expression, context, {
      discard: true
    })

    if (arrayPopCall != null) {
      return arrayPopCall.lines
    }

    const arrayPushCall = deps.emitPreparedArrayPushCallExpression(statement.expression, context)

    if (arrayPushCall != null) {
      return arrayPushCall.lines
    }

    const arrayMapCall = deps.emitPreparedArrayMapCallExpression(statement.expression, context)

    if (arrayMapCall != null) {
      return arrayMapCall.lines
    }

    const arrayFilterCall = deps.emitPreparedArrayFilterCallExpression(statement.expression, context)

    if (arrayFilterCall != null) {
      return arrayFilterCall.lines
    }

    const arraySortCall = deps.emitPreparedArraySortCallExpression(statement.expression, context)

    if (arraySortCall != null) {
      return arraySortCall.lines
    }

    const classMethodCall = deps.emitPreparedClassMethodCallExpression(statement.expression, context)

    if (classMethodCall != null) {
      if (classMethodCall.expression === '') {
        return classMethodCall.lines
      }

      const lines: string[] = []
      pushAllLines(lines, classMethodCall.lines)
      lines.push(`${classMethodCall.expression};`)
      return lines
    }

    const fetchAbortCall = deps.emitFetchAbortControllerAbortStatement(statement.expression, context)

    if (fetchAbortCall != null) {
      return fetchAbortCall
    }

    if (deps.isArrayMethodCall(statement.expression)) {
      context.diagnostics.push(
        diagnostic(
          'CCJS_C_ARRAY_METHOD',
          'array methods are not supported by the current C backend slice',
          statement.loc
        )
      )
      return []
    }

    const processExit = deps.emitProcessExitStatement(statement.expression, context)

    if (processExit != null) {
      return processExit
    }

    const collectionCall = deps.emitPreparedCollectionCallExpression(statement.expression, context)

    if (collectionCall != null) {
      return collectionCall.lines
    }

    const debugMemoryCall = deps.emitPreparedDebugMemoryCallExpression(statement.expression, context, {
      discard: true
    })

    if (debugMemoryCall != null) {
      return debugMemoryCall.lines
    }

    const cryptoCall = deps.emitPreparedCryptoCallExpression(statement.expression, context, {
      discard: true
    })

    if (cryptoCall != null) {
      return cryptoCall.lines
    }

    const cryptoNumberCall = deps.emitPreparedCryptoNumberCallExpression(statement.expression, context)

    if (cryptoNumberCall != null) {
      return cryptoNumberCall.lines
    }

    const fetchCall = deps.emitPreparedFetchCallExpression(statement.expression, context)

    if (fetchCall != null) {
      return fetchCall.lines
    }

    const fsCall = deps.emitPreparedFsCallExpression(statement.expression, context)

    if (fsCall != null) {
      return fsCall.lines
    }

    const fsSyncCall = deps.emitPreparedFsSyncStatementExpression(statement.expression, context)

    if (fsSyncCall != null) {
      return fsSyncCall.lines
    }

    const timerCall = deps.emitPreparedTimerCallExpression(statement.expression, context)

    if (timerCall != null) {
      return timerCall.lines
    }

    const cryptoHashCall = deps.emitPreparedCryptoHashCallExpression(statement.expression, context)

    if (cryptoHashCall != null) {
      return cryptoHashCall.lines
    }

    const cryptoHmacCall = deps.emitPreparedCryptoHmacCallExpression(statement.expression, context)

    if (cryptoHmacCall != null) {
      return cryptoHmacCall.lines
    }

    const promise = deps.emitPreparedPromiseStaticExpression(statement.expression, context)

    if (promise != null) {
      return promise.lines
    }

    const call = deps.emitPreparedCallExpression(statement.expression, context)

    if (call.expression === '') {
      return call.lines
    }

    const lines: string[] = []
    pushAllLines(lines, call.lines)
    lines.push(`${call.expression};`)
    return lines
  }

  if (statement.expression.type === 'AwaitExpression') {
    const value = deps.emitCAwaitValueExpression(statement.expression, context)

    return value.lines
  }

  if (statement.expression.type === 'UpdateExpression') {
    const value = deps.emitPreparedUpdateExpression(statement.expression, context)

    const lines: string[] = []
    pushAllLines(lines, value.lines)
    lines.push(`${value.expression};`)
    return lines
  }

  if (statement.expression.type === 'AssignmentExpression') {
    const processExitCodeAssignment = deps.emitProcessExitCodeAssignment(statement.expression, context)

    if (processExitCodeAssignment != null) {
      return processExitCodeAssignment
    }

    const mapIndexAssignment = deps.emitPreparedMapIndexAssignment(statement.expression, context)

    if (mapIndexAssignment != null) {
      return mapIndexAssignment.lines
    }

    const urlFieldAssignment = deps.emitUrlObjectFieldAssignment(statement.expression, context)

    if (urlFieldAssignment != null) {
      return urlFieldAssignment
    }

    if (statement.expression.target.type === 'MemberExpression') {
      const member = deps.resolveKnownObjectMember(statement.expression.target, context)

      if (member != null) {
        return deps.emitKnownObjectMemberAssignment(statement.expression, member, context)
      }
    }

    if (statement.expression.target.type === 'IndexExpression') {
      const bytesIndexAssignment = deps.emitPreparedBytesIndexAssignment(statement.expression, context)

      if (bytesIndexAssignment != null) {
        return bytesIndexAssignment.lines
      }

      const element = deps.resolveKnownArrayIndex(statement.expression.target, context)

      if (element != null) {
        return deps.emitKnownArrayIndexAssignment(statement.expression, element, context)
      }

      const field = deps.resolveKnownObjectIndex(statement.expression.target, context)

      if (field != null) {
        return deps.emitDynamicObjectMemberAssignment(statement.expression, field, context)
      }
    }

    const valueType = deps.inferExpressionType(statement.expression.value, context)

    if (deps.isNullableRuntimeValueAssignment(statement.expression, context)) {
      return deps.emitNullableRuntimeValueAssignment(statement.expression, context)
    }

    if (deps.isBoxedRuntimeValueAssignment(statement.expression, context)) {
      return deps.emitBoxedRuntimeValueAssignment(statement.expression, context)
    }

    if (valueType === 'number' || valueType === 'boolean') {
      const value = deps.emitPreparedNumberExpression(statement.expression.value, context)

      const lines: string[] = []
      pushAllLines(lines, value.lines)
      lines.push(`${deps.emitReference(statement.expression.target, context)} = ${value.expression};`)
      return lines
    }

    return [
      `${deps.emitReference(statement.expression.target, context)} = ${deps.emitCExpression(statement.expression.value, context)};`
    ]
  }

  if (statement.expression.type === 'OptionalCallExpression') {
    return deps.emitOptionalRuntimeCallbackCallExpression(statement.expression, context)
  }

  return []
}

function normalizeCAsyncReturnArgument(argument, context: CFunctionContext, loc) {
  if (
    argument == null ||
    context.returnType === 'promise' ||
    (argument.valueType !== 'promise' && statementDeps(context).inferExpressionType(argument, context) !== 'promise')
  ) {
    return argument
  }

  return {
    type: 'AwaitExpression',
    argument,
    valueType: context.returnType,
    loc
  }
}

function isRuntimeCallbackReturnContext(context: CFunctionContext) {
  const returnType = context.runtimeCallbackReturnType

  return (
    context.statusReturn === true &&
    returnType != null &&
    (returnType === 'void' || ['number', 'boolean'].includes(returnType) || isManagedRuntimeReturnType(returnType))
  )
}

function emitPromiseReturnStatement(statement, context: CFunctionContext) {
  const promise = statementDeps(context).emitPreparedPromiseExpression(statement.argument, context, {
    out: 'ccjs_return',
    owned: false
  })

  if (promise == null) {
    context.diagnostics.push(
      diagnostic(
        'CCJS_C_ASYNC',
        'this Promise return expression is not supported by the current C backend slice',
        statement.loc
      )
    )

    return emitReturnJump(context)
  }

  const lines: string[] = []
  pushAllLines(lines, promise.lines)
  pushAllLines(lines, emitReturnJump(context))
  return lines
}

function emitRuntimeCallbackReturnStatement(statement, context: CFunctionContext) {
  if (context.runtimeCallbackReturnType === 'void') {
    return emitReturnJump(context)
  }

  const lines: string[] = []

  if (isManagedRuntimeReturnType(context.runtimeCallbackReturnType)) {
    pushAllLines(lines, emitRuntimeCallbackRuntimeValueReturnLines(statement.argument, context))
  } else {
    pushAllLines(lines, emitRuntimeCallbackScalarReturnLines(statement.argument, context))
  }

  pushAllLines(lines, emitReturnJump(context))
  return lines
}

function emitRuntimeCallbackScalarReturnLines(argument, context: CFunctionContext) {
  let value: PreparedExpression;

  if (argument == null) {
    value = {
      lines: [],
      expression: '0'
    }
  } else {
    value = statementDeps(context).emitPreparedNumberExpression(argument, context)
  }

  let expression = `ccjs_bool_value((${value.expression}) != 0)`

  if (context.runtimeCallbackReturnType === 'number') {
    expression = `ccjs_number_value(${value.expression})`
  }

  const lines: string[] = []
  pushAllLines(lines, value.lines)
  lines.push(`${context.runtimeCallbackReturnOut} = ${expression};`)
  return lines
}

export function emitRuntimeCallbackRuntimeValueReturnLines(argument, context: CFunctionContext) {
  if (context.runtimeCallbackReturnType == null || context.runtimeCallbackReturnOut == null) {
    return emitReturnJump(context)
  }

  const expectedTag = cRuntimeValueTag(context.runtimeCallbackReturnType)
  let value: PreparedExpression;

  if (argument == null) {
    value = {
      lines: [],
      expression: 'ccjs_undefined_value()'
    }
  } else {
    value = emitRuntimeReturnValueExpression(
      argument,
      context,
      context.runtimeCallbackReturnType,
      context.runtimeCallbackReturnShape
    )
  }

  const lines: string[] = []
  pushAllLines(lines, value.lines)
  lines.push(`${context.runtimeCallbackReturnOut} = ${value.expression};`)
  lines.push(emitRuntimeValueCheck(context.runtimeCallbackReturnOut, expectedTag, context))
  lines.push(`ccjs_retain(${context.runtimeCallbackReturnOut});`)
  return lines
}

function emitRuntimeReturnValueExpression(argument, context: CFunctionContext, returnType, returnShape) {
  if (returnType === 'object' && argument != null && argument.type === 'ObjectLiteral') {
    return statementDeps(context).emitCObjectLiteralValueExpression(argument, context, returnShape)
  }

  return statementDeps(context).emitCValueExpression(argument, context)
}

function emitRuntimeValueReturnStatement(statement, context: CFunctionContext) {
  if (statement.argument == null) {
    return emitReturnJump(context)
  }

  const expectedTag = cRuntimeValueTag(context.returnType)
  const value = emitRuntimeReturnValueExpression(statement.argument, context, context.returnType, context.returnShape)

  const lines: string[] = []
  pushAllLines(lines, value.lines)
  lines.push(`ccjs_return = ${value.expression};`)
  lines.push(emitRuntimeValueCheck('ccjs_return', expectedTag, context))
  lines.push('ccjs_retain(ccjs_return);')
  pushAllLines(lines, emitReturnJump(context))
  return lines
}

function emitNullableScalarReturnStatement(statement, context: CFunctionContext) {
  const expectedTag = cRuntimeValueTag(context.returnType)
  let value: PreparedExpression;

  if (statement.argument == null) {
    value = {
      lines: [],
      expression: 'ccjs_null_value()'
    }
  } else {
    value = statementDeps(context).emitNullableScalarValueExpression(statement.argument, context)
  }

  const lines: string[] = []
  pushAllLines(lines, value.lines)
  lines.push(`ccjs_return = ${value.expression};`)
  pushAllLines(lines, emitRuntimeNullableValueCheck('ccjs_return', expectedTag, context))
  pushAllLines(lines, emitReturnJump(context))
  return lines
}

export function emitCatchBindingTypeCheck(valueType) {
  if (valueType === 'object') {
    return 'ccjs_error.tag != CCJS_TAG_OBJECT || ccjs_error.as.ref == 0'
  }

  return 'ccjs_error.tag != CCJS_TAG_STRING || ccjs_error.as.ref == 0'
}

export function registerErrorChannel(context: CFunctionContext) {
  context.errorChannelUsed = true
  registerOwnedValue(context, 'ccjs_error')
}

export function currentErrorTarget(context: CFunctionContext) {
  return lastStringOrNull(context.errorTargets)
}

export function emitBreakJump(context: CFunctionContext) {
  const target = currentBreakTarget(context)

  if (target == null) {
    return ['break;']
  }

  if (target.throughFinally) {
    registerBreakFlow(context)

    return ['ccjs_break_active = 1;', `goto ${target.label};`]
  }

  return [`goto ${target.label};`]
}

export function emitContinueJump(context: CFunctionContext) {
  const target = currentContinueTarget(context)

  if (target == null) {
    return ['continue;']
  }

  if (target.throughFinally) {
    registerContinueFlow(context)

    return ['ccjs_continue_active = 1;', `goto ${target.label};`]
  }

  return [`goto ${target.label};`]
}

export function emitBreakTargetLabel(label, context: CFunctionContext) {
  const lines = [`${label}:`]

  if (context.breakFlowUsed) {
    lines.push('  if (ccjs_break_active) ccjs_break_active = 0;')
  }

  lines.push(';')
  return lines
}

export function emitContinueTargetLabel(label, context: CFunctionContext) {
  const lines = [`${label}:`]

  if (context.continueFlowUsed) {
    lines.push('  if (ccjs_continue_active) ccjs_continue_active = 0;')
  }

  lines.push('  ;')
  return lines
}

function registerBreakFlow(context: CFunctionContext) {
  context.breakFlowUsed = true
}

function registerContinueFlow(context: CFunctionContext) {
  context.continueFlowUsed = true
}

export function currentBreakTarget(context: CFunctionContext) {
  return lastFlowTargetOrNull(context.breakTargets)
}

export function currentContinueTarget(context: CFunctionContext) {
  return lastFlowTargetOrNull(context.continueTargets)
}

export function withBreakTarget(context: CFunctionContext, label, throughFinally, callback) {
  if (label == null) {
    return callback()
  }

  context.breakTargets.push({
    label,
    throughFinally
  })

  try {
    return callback()
  } finally {
    context.breakTargets.pop()
  }
}

export function withContinueTarget(context: CFunctionContext, label, throughFinally, callback) {
  if (label == null) {
    return callback()
  }

  context.continueTargets.push({
    label,
    throughFinally
  })

  try {
    return callback()
  } finally {
    context.continueTargets.pop()
  }
}

export function withFinallyFlowTarget(context: CFunctionContext, label, callback) {
  return withReturnTarget(context, label, () =>
    withBreakTarget(context, label, true, () => withContinueTarget(context, label, true, callback))
  )
}

export function emitReturnJump(context: CFunctionContext) {
  const target = currentReturnTarget(context)

  if (target != null) {
    registerReturnFlow(context)

    return ['ccjs_return_active = 1;', `goto ${target};`]
  }

  return [emitReturnCleanupStatement(context)]
}

export function emitReturnCleanupStatement(context: CFunctionContext) {
  if (context.statusReturn && context.runtimeCallbackCleanupLabel != null) {
    context.usedRuntimeCallbackCleanupGoto = true

    return `goto ${context.runtimeCallbackCleanupLabel};`
  }

  if (context.cleanupEnabled) {
    context.usedCleanupGoto = true

    return 'goto ccjs_cleanup;'
  }

  if (context.returnType === 'void') {
    return 'return;'
  }

  return 'return ccjs_return;'
}

function registerReturnFlow(context: CFunctionContext) {
  context.returnFlowUsed = true
}

export function currentReturnTarget(context: CFunctionContext) {
  return lastStringOrNull(context.returnTargets)
}

export function withReturnTarget(context: CFunctionContext, target, callback) {
  if (target == null) {
    return callback()
  }

  context.returnTargets.push(target)

  try {
    return callback()
  } finally {
    context.returnTargets.pop()
  }
}

export function withErrorTarget(context: CFunctionContext, target, callback) {
  if (target == null) {
    return callback()
  }

  context.errorTargets.push(target)

  try {
    return callback()
  } finally {
    context.errorTargets.pop()
  }
}
