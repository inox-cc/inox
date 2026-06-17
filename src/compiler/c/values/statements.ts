import {
  emitPrepareOwnedValueWrite,
  emitRuntimeTypeCheck,
  emitStatusCheck,
  narrowNullableScalars,
  nextCName,
  pushDiagnostic,
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

type StatementNode = AnyNode

type CLoopFlowTarget = {
  label: string
  throughFinally: boolean
}

type CFunctionContext = any

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

type RuntimeForOfMapValues = {
  elementType: string
  lines: string[]
  name: string
}

type RuntimeMapMetadata = {
  key: string
  value: string
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
  emitArrayVariableDeclaration(statement: StatementNode, context: CFunctionContext): string[]
  emitArrayFilterVariableDeclaration(
    statement: StatementNode,
    filtered: PreparedArrayExpression,
    context: CFunctionContext
  ): string[]
  emitArrayMapVariableDeclaration(statement: StatementNode, mapped: PreparedArrayExpression, context: CFunctionContext): string[]
  emitArraySortVariableDeclaration(statement: StatementNode, sorted: PreparedArrayExpression, context: CFunctionContext): string[]
  emitBoxedObjectVariableDeclaration(statement: StatementNode, context: CFunctionContext): string[]
  emitCAwaitValueExpression(expression: StatementNode, context: CFunctionContext): PreparedExpression
  emitCExpression(expression: StatementNode, context: CFunctionContext): string
  emitClassObjectVariableDeclaration(statement: StatementNode, context: CFunctionContext): string[]
  emitCObjectLiteralValueExpression(
    expression: StatementNode,
    context: CFunctionContext,
    shape?: CObjectShape | null
  ): PreparedExpression
  emitCValueExpression(expression: StatementNode, context: CFunctionContext): PreparedExpression
  collectionConstructorName(expression: StatementNode): string | null
  emitDgramAddressVariableDeclaration(statement: StatementNode, context: CFunctionContext): string[] | null
  emitDgramNumberVariableDeclaration(statement: StatementNode, context: CFunctionContext): string[] | null
  emitDgramSocketVariableDeclaration(statement: StatementNode, context: CFunctionContext): string[] | null
  emitDgramSocketCallStatement(expression: StatementNode, context: CFunctionContext): string[] | null
  emitDynamicObjectMemberVariableDeclaration(
    statement: StatementNode,
    member: CKnownObjectIndexField,
    context: CFunctionContext
  ): string[]
  emitDynamicObjectMemberAssignment(expression: StatementNode, member: CKnownObjectIndexField, context: CFunctionContext): string[]
  emitDynamicObjectFieldAssignment(expression: StatementNode, context: CFunctionContext): string[] | null
  emitErrorObjectVariableDeclaration(statement: StatementNode, context: CFunctionContext): string[]
  emitFailureStatement(context: CFunctionContext): string
  emitFetchAbortControllerVariableDeclaration(statement: StatementNode, context: CFunctionContext): string[] | null
  emitFetchAbortControllerAbortStatement(expression: StatementNode, context: CFunctionContext): string[] | null
  emitFunctionPointerVariable(
    name: string,
    init: StatementNode,
    context: CFunctionContext,
    isConst: boolean,
    functionType: CFunctionType | null | undefined,
    loc: CSourceLocation
  ): string
  emitHttpServerVariableDeclaration(statement: StatementNode, context: CFunctionContext): string[] | null
  emitHttpServerCallStatement(expression: StatementNode, context: CFunctionContext): string[] | null
  emitJsonParseVariableDeclaration(statement: StatementNode, context: CFunctionContext): string[] | null
  emitKnownArrayIndexAssignment(expression: StatementNode, element: CKnownArrayElement, context: CFunctionContext): string[]
  emitKnownArrayIndexVariableDeclaration(
    statement: StatementNode,
    element: CKnownArrayElement,
    context: CFunctionContext
  ): string[]
  emitKnownObjectMemberAssignment(expression: StatementNode, member: CKnownObjectField, context: CFunctionContext): string[]
  emitKnownObjectMemberVariableDeclaration(
    statement: StatementNode,
    member: CKnownObjectField,
    context: CFunctionContext
  ): string[]
  emitNetAddressMemberVariableDeclaration(statement: StatementNode, context: CFunctionContext): string[] | null
  emitNetAddressVariableDeclaration(statement: StatementNode, context: CFunctionContext): string[] | null
  emitNetNumberVariableDeclaration(statement: StatementNode, context: CFunctionContext): string[] | null
  emitNetServerCallStatement(expression: StatementNode, context: CFunctionContext): string[] | null
  emitNetServerVariableDeclaration(statement: StatementNode, context: CFunctionContext): string[] | null
  emitNetSocketCallStatement(expression: StatementNode, context: CFunctionContext): string[] | null
  emitNetSocketVariableDeclaration(statement: StatementNode, context: CFunctionContext): string[] | null
  emitNullableScalarValueExpression(expression: StatementNode, context: CFunctionContext): PreparedExpression
  emitNullableRuntimeValueAssignment(expression: StatementNode, context: CFunctionContext): string[]
  emitObjectVariableDeclaration(statement: StatementNode, context: CFunctionContext): string[]
  emitOptionalRuntimeCallbackCallExpression(expression: StatementNode, context: CFunctionContext): string[]
  emitPreparedArrayFilterCallExpression(
    expression: StatementNode,
    context: CFunctionContext
  ): PreparedArrayExpression | null
  emitPreparedArrayMapCallExpression(expression: StatementNode, context: CFunctionContext): PreparedArrayExpression | null
  emitPreparedArrayPopCallExpression(
    expression: StatementNode,
    context: CFunctionContext,
    options: PreparedCallOptions | null
  ): PreparedExpression | null
  emitPreparedArrayPushCallExpression(expression: StatementNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedArraySortCallExpression(
    expression: StatementNode,
    context: CFunctionContext
  ): PreparedArrayExpression | null
  emitPreparedAsyncFunctionPromiseCallExpression(expression: StatementNode, context: CFunctionContext, options?: PreparedCallOptions): PreparedExpression | null
  emitPreparedBytesIndexAssignment(expression: StatementNode, context: CFunctionContext): PreparedStatement | null
  emitPreparedCallExpression(expression: StatementNode, context: CFunctionContext): PreparedExpression
  emitPreparedChildProcessCallExpression(expression: StatementNode, context: CFunctionContext, options?: PreparedCallOptions): PreparedExpression | null
  emitPreparedClassMethodCallExpression(expression: StatementNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedCollectionCallExpression(expression: StatementNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedCryptoCallExpression(expression: StatementNode, context: CFunctionContext, options?: PreparedCallOptions): PreparedExpression | null
  emitPreparedCryptoHashCallExpression(expression: StatementNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedCryptoHmacCallExpression(expression: StatementNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedCryptoNumberCallExpression(expression: StatementNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedDebugMemoryCallExpression(expression: StatementNode, context: CFunctionContext, options?: PreparedCallOptions): PreparedExpression | null
  emitPreparedFetchCallExpression(expression: StatementNode, context: CFunctionContext, options?: PreparedCallOptions): PreparedExpression | null
  emitPreparedFetchHeadersCallExpression(expression: StatementNode, context: CFunctionContext, options?: PreparedCallOptions): PreparedExpression | null
  emitPreparedFsCallExpression(expression: StatementNode, context: CFunctionContext, options?: PreparedCallOptions): PreparedExpression | null
  emitPreparedFsSyncStatementExpression(expression: StatementNode, context: CFunctionContext): PreparedStatement | null
  emitPreparedMapIndexAssignment(expression: StatementNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedNumberExpression(expression: StatementNode, context: CFunctionContext): PreparedExpression
  emitPreparedRuntimeTruthinessExpression(expression: StatementNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedPathObjectCallExpression(expression: StatementNode, context: CFunctionContext, options?: PreparedCallOptions): PreparedExpression | null
  emitPreparedPromiseConstructorExpression(expression: StatementNode, context: CFunctionContext, options?: PreparedCallOptions): PreparedExpression | null
  emitPreparedPromiseExpression(expression: StatementNode, context: CFunctionContext, options?: PreparedCallOptions): PreparedExpression | null
  emitPreparedPromiseMethodExpression(expression: StatementNode, context: CFunctionContext, options?: PreparedCallOptions): PreparedExpression | null
  emitPreparedPromiseReturningCallExpression(expression: StatementNode, context: CFunctionContext, options?: PreparedCallOptions): PreparedExpression | null
  emitPreparedPromiseStaticExpression(expression: StatementNode, context: CFunctionContext, options?: PreparedCallOptions): PreparedExpression | null
  emitPreparedTimerCallExpression(expression: StatementNode, context: CFunctionContext, options?: PreparedCallOptions): PreparedExpression | null
  emitPreparedUpdateExpression(expression: StatementNode, context: CFunctionContext): PreparedExpression
  emitPreparedUrlObjectExpression(expression: StatementNode, context: CFunctionContext, options?: PreparedCallOptions): PreparedExpression | null
  emitPreparedUrlSearchParamsObjectExpression(expression: StatementNode, context: CFunctionContext, options?: PreparedCallOptions): PreparedExpression | null
  emitProcessExitCodeAssignment(expression: StatementNode, context: CFunctionContext): string[] | null
  emitProcessExitStatement(expression: StatementNode, context: CFunctionContext): string[] | null
  emitPromiseConstructorSettlementCall(expression: StatementNode, context: CFunctionContext): string[] | null
  emitReference(expression: StatementNode, context: CFunctionContext): string
  emitModuleValueVariableAssignment(statement: StatementNode, context: CFunctionContext): string[]
  emitRuntimeCallbackVariableDeclaration(statement: StatementNode, context: CFunctionContext): string[]
  emitScalarVariableDeclaration(statement: StatementNode, context: CFunctionContext): string[]
  emitStatement(statement: StatementNode, context: CFunctionContext): string[]
  emitStringExpression(expression: StatementNode, context: CFunctionContext): string
  emitUrlObjectFieldAssignment(expression: StatementNode, context: CFunctionContext): string[] | null
  inferCatchBindingValueType(statement: StatementNode, context: CFunctionContext): string
  inferExpressionType(expression: StatementNode, context: CFunctionContext): string
  isArrayMethodCall(expression: StatementNode): boolean
  isBoxedRuntimeValueAssignment(expression: StatementNode, context: CFunctionContext): boolean
  isClassConstructorExpression(expression: StatementNode, context: CFunctionContext): boolean
  isConsoleLog(expression: StatementNode): boolean
  isCollectionConstructorExpression(expression: StatementNode): boolean
  isErrorConstructorExpression(expression: StatementNode): boolean
  isErrorValueExpression(expression: StatementNode, context: CFunctionContext): boolean
  isIndexAccessExpression(expression: StatementNode): boolean
  isDynamicRuntimeValueExpression(expression: StatementNode, context: CFunctionContext): boolean
  isMemberAccessExpression(expression: StatementNode): boolean
  isNullableRuntimeValueAssignment(expression: StatementNode, context: CFunctionContext): boolean
  isRuntimeProducedStringExpression(expression: StatementNode, context: CFunctionContext): boolean
  registerErrorObjectShape(context: CFunctionContext, name: string): void
  resolveForOfElementType(elements: CArrayElementInfo[]): string
  resolveKnownArrayIndex(expression: StatementNode, context: CFunctionContext): CKnownArrayElement | null
  resolveKnownObjectIndex(expression: StatementNode, context: CFunctionContext): CKnownObjectIndexField | null
  resolveKnownObjectMember(expression: StatementNode, context: CFunctionContext): CKnownObjectField | null
  resolveKnownForOfArray(expression: StatementNode, context: CFunctionContext): KnownForOfArray | null
  resolveNullableScalarConditionNarrowing(
    expression: StatementNode,
    context: CFunctionContext
  ): NullableScalarConditionNarrowing
  resolveRuntimeStringReference(expression: StatementNode, context: CFunctionContext): string | null
  resolveRuntimeArrayIndex(expression: StatementNode, context: CFunctionContext): CRuntimeArrayElement | null
  resolveRuntimeForOfArray(expression: StatementNode, context: CFunctionContext): RuntimeForOfArray | null
  resolveRuntimeForOfMap(expression: StatementNode, context: CFunctionContext): RuntimeForOfMap | null
  resolveRuntimeForOfMapValues(expression: StatementNode, context: CFunctionContext): RuntimeForOfMapValues | null
  resolveRuntimeForOfSet(expression: StatementNode, context: CFunctionContext): RuntimeForOfSet | null
  emitBoxedRuntimeValueAssignment(expression: StatementNode, context: CFunctionContext): string[]
  emitConsoleLogStatement(method: string, args: StatementNode[], context: CFunctionContext): string[]
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

function isUnsignedIntegerLiteral(value: string): boolean {
  if (value.length === 0) {
    return false
  }

  for (let index = 0; index < value.length; index = index + 1) {
    const code = value.charCodeAt(index)

    if (code < 48 || code > 57) {
      return false
    }
  }

  return true
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

function lastFlowTargetOrNull(values: CLoopFlowTarget[]): CLoopFlowTarget | null {
  if (values.length === 0) {
    return null
  }

  return values[values.length - 1]
}

function pushFlowTarget(values: CLoopFlowTarget[], value: CLoopFlowTarget): void {
  values.push(value)
}

function popFlowTarget(values: CLoopFlowTarget[]): void {
  values.pop()
}

function pushStringTarget(values: string[], value: string): void {
  values.push(value)
}

function popStringTarget(values: string[]): void {
  values.pop()
}

export function emitStatementBody(statement: StatementNode, context: CFunctionContext): string[] {
  if (statement.type === 'BlockStatement') {
    return emitStatementList(statement.body, context)
  }

  return statementDeps(context).emitStatement(statement, context)
}

export function emitStatementList(statements: StatementNode[], context: CFunctionContext): string[] {
  const result: string[] = []

  for (const statement of statements) {
    const lines = statementDeps(context).emitStatement(statement, context)
    pushAllLines(result, lines)

    applyNullableScalarEarlyReturnNarrowing(statement, context)
  }

  return result
}

function applyNullableScalarEarlyReturnNarrowing(statement: StatementNode, context: CFunctionContext): void {
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

function statementDefinitelyReturns(statement: StatementNode): boolean {
  if (statement.type === 'ReturnStatement') {
    return true
  }

  if (statement.type === 'BlockStatement') {
    return statementBodyDefinitelyReturns(statement.body)
  }

  if (statement.type === 'IfStatement' && statement.alternate != null) {
    return statementDefinitelyReturns(statement.consequent) && statementDefinitelyReturns(statement.alternate)
  }

  return false
}

function statementBodyDefinitelyReturns(statements: StatementNode[]): boolean {
  for (let index = 0; index < statements.length; index = index + 1) {
    if (statementDefinitelyReturns(statements[index])) {
      return true
    }
  }

  return false
}

function emitScopedStatementBody(statement: StatementNode, context: CFunctionContext, narrowedNames: string[]): string[] {
  const variableScope = pushVariableScope(context)
  const nullableScope = pushNullableScalarNarrowing(context, narrowedNames)
  const lines = emitStatementBody(statement, context)

  restoreNullableScalarNarrowing(context, nullableScope)
  restoreVariableScope(context, variableScope)

  return lines
}

function emitScopedStatementList(statements: StatementNode[], context: CFunctionContext): string[] {
  const variableScope = pushVariableScope(context)
  const lines = emitStatementList(statements, context)

  restoreVariableScope(context, variableScope)

  return lines
}

export function emitIfStatement(statement: StatementNode, context: CFunctionContext): string[] {
  const condition = emitPreparedConditionExpression(statement.condition, context)
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

export function emitWhileStatement(statement: StatementNode, context: CFunctionContext): string[] {
  const condition = emitPreparedConditionExpression(statement.condition, context)
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

export function emitForStatement(statement: StatementNode, context: CFunctionContext): string[] {
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

export function emitRuntimeStringVariableDeclaration(
  statement: StatementNode,
  expression: StatementNode,
  context: CFunctionContext
): string[] {
  const value = statementDeps(context).emitCValueExpression(expression, context)
  const lines: string[] = []
  pushAllLines(lines, value.lines)
  lines.push(`${constPrefix(statement.kind === 'const')}ccjs_string* ${statement.name} = (ccjs_string*)${value.expression}.as.ref;`)

  context.variables.set(statement.name, 'string')
  context.runtimeStrings.add(statement.name)

  return lines
}

export function emitStringScalarVariableDeclaration(statement: StatementNode, context: CFunctionContext, inferred: string): string[] | null {
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

  if (statement.kind !== 'const' && isRawStringLiteralExpression(statement.init)) {
    return emitRuntimeStringVariableDeclaration(statement, statement.init, context)
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
  statement: StatementNode,
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

export function emitNumberBooleanScalarVariableDeclaration(statement: StatementNode, context: CFunctionContext, inferred: string): string[] {
  if ((inferred === 'number' || inferred === 'boolean') && context.boxedMutableCaptureDeclarations.has(statement)) {
    return emitBoxedScalarVariableDeclaration(statement, context)
  }

  if (!isNullableScalarType(inferred)) {
    pushDiagnostic(context,
      diagnostic(
        cUnsupportedExpressionCode(inferred),
        'this expression is not supported by the current C backend slice',
        statement.loc
      )
    )
    return [`double ${statement.name} = 0;`]
  }

  const dynamicObjectField = emitDynamicObjectScalarVariableDeclaration(statement, inferred, context)

  if (dynamicObjectField != null) {
    return dynamicObjectField
  }

  const value = statementDeps(context).emitPreparedNumberExpression(statement.init, context)
  const lines: string[] = []
  pushAllLines(lines, value.lines)
  lines.push(`${constPrefix(statement.kind === 'const')}double ${statement.name} = ${value.expression};`)

  return lines
}

function emitDynamicObjectScalarVariableDeclaration(
  statement: StatementNode,
  valueType: string,
  context: CFunctionContext
): string[] | null {
  if (!isDynamicObjectScalarFieldInitializer(statement.init, context)) {
    return null
  }

  const deps = statementDeps(context)
  const value = deps.emitCValueExpression(statement.init, context)
  const tag = cRuntimeValueTag(valueType)
  const lines: string[] = []
  let runtimeValueExpression = `${value.expression}.as.number`

  if (valueType === 'boolean') {
    runtimeValueExpression = `(${value.expression}.as.boolean ? 1 : 0)`
  }

  pushAllLines(lines, value.lines)
  lines.push(emitRuntimeValueCheck(value.expression, tag, context))
  lines.push(`${constPrefix(statement.kind === 'const')}double ${statement.name} = ${runtimeValueExpression};`)

  return lines
}

function isDynamicObjectScalarFieldInitializer(
  expression: StatementNode,
  context: CFunctionContext
): boolean {
  const deps = statementDeps(context)

  if (deps.isMemberAccessExpression(expression)) {
    return (
      deps.resolveKnownObjectMember(expression, context) == null &&
      deps.inferExpressionType(expression.object, context) === 'object'
    )
  }

  if (deps.isIndexAccessExpression(expression) && expression.index.type === 'StringLiteral') {
    return (
      deps.resolveKnownObjectIndex(expression, context) == null &&
      deps.inferExpressionType(expression.object, context) === 'object'
    )
  }

  return false
}

export function emitRuntimeValueVariableDeclaration(
  statement: StatementNode,
  expression: StatementNode,
  context: CFunctionContext,
  valueTypeOverride?: string | null
): string[] {
  const valueType = valueTypeOverride ?? statementDeps(context).inferExpressionType(expression, context)
  const expectedTag = cRuntimeValueTag(valueType)
  let objectLiteralExpression = false

  if (valueType === 'object') {
    if (expression.type === 'ObjectLiteral') {
      objectLiteralExpression = true
    }
  }

  let value = statementDeps(context).emitCValueExpression(expression, context)

  if (objectLiteralExpression) {
    value = statementDeps(context).emitCObjectLiteralValueExpression(expression, context, statement.shape)
  }

  registerOwnedValue(context, statement.name)
  registerRuntimeValueMetadata(statement.name, valueType, statement, expression, context)

  const lines: string[] = []
  pushAllLines(lines, value.lines)
  pushAllLines(lines, emitPrepareOwnedValueWrite(statement.name))
  lines.push(`${statement.name} = ${value.expression};`)
  const valueCheck = emitRuntimeValueCheck(statement.name, expectedTag, context)

  if (valueCheck !== '') {
    lines.push(valueCheck)
  }

  lines.push(`ccjs_retain(${statement.name});`)

  return lines
}

export function registerRuntimeValueMetadata(
  name: string,
  valueType: string,
  declaration: StatementNode,
  expression: StatementNode | null | undefined,
  context: CFunctionContext
): void {
  context.variables.set(name, valueType)

  if (valueType === 'object') {
    registerObjectShape(context, name, resolveRuntimeObjectShape(declaration, expression))
  } else if (valueType === 'array') {
    context.runtimeArrayElementTypes.set(name, resolveRuntimeArrayMetadataElementType(declaration, expression, context))
  } else if (valueType === 'map') {
    let mapType: RuntimeMapMetadata | null = null

    if (expression != null) {
      mapType = resolveRuntimeMapType(expression, context)
    }

    context.mapTypes.set(name, {
      key: resolveRuntimeMapMetadataKeyType(declaration, expression, mapType),
      value: resolveRuntimeMapMetadataValueType(declaration, expression, mapType)
    })
  } else if (valueType === 'set') {
    context.setElementTypes.set(name, resolveRuntimeSetMetadataElementType(declaration, expression, context))
  }
}

function resolveRuntimeObjectShape(declaration: StatementNode, expression: StatementNode | null | undefined): CObjectShape | null {
  if (declaration.shape != null) {
    return declaration.shape
  }

  if (expression != null && expression.shape != null) {
    return expression.shape
  }

  return null
}

function resolveRuntimeArrayMetadataElementType(
  declaration: StatementNode,
  expression: StatementNode | null | undefined,
  context: CFunctionContext
): string {
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

function resolveRuntimeMapMetadataKeyType(
  declaration: StatementNode,
  expression: StatementNode | null | undefined,
  mapType: RuntimeMapMetadata | null
): string {
  if (declaration.mapKeyType != null) {
    return declaration.mapKeyType
  }

  if (mapType != null) {
    return mapType.key
  }

  if (expression != null && expression.mapKeyType != null) {
    return expression.mapKeyType
  }

  return 'unknown'
}

function resolveRuntimeMapMetadataValueType(
  declaration: StatementNode,
  expression: StatementNode | null | undefined,
  mapType: RuntimeMapMetadata | null
): string {
  if (declaration.mapValueType != null) {
    return declaration.mapValueType
  }

  if (mapType != null) {
    return mapType.value
  }

  if (expression != null && expression.mapValueType != null) {
    return expression.mapValueType
  }

  return 'unknown'
}

function resolveRuntimeSetMetadataElementType(
  declaration: StatementNode,
  expression: StatementNode | null | undefined,
  context: CFunctionContext
): string {
  if (declaration.setElementType != null) {
    return declaration.setElementType
  }

  let resolvedElementType: string | null = null

  if (expression != null) {
    resolvedElementType = resolveRuntimeSetElementType(expression, context)
  }

  if (resolvedElementType != null) {
    return resolvedElementType
  }

  if (expression != null && expression.setElementType != null) {
    return expression.setElementType
  }

  return 'unknown'
}

export function isRuntimeValueLocalExpression(expression: StatementNode, context: CFunctionContext): boolean {
  const valueType = statementDeps(context).inferExpressionType(expression, context)

  return (
    valueType === 'bytes' ||
    valueType === 'object' ||
    valueType === 'array' ||
    valueType === 'map' ||
    valueType === 'set'
  )
}

export function emitBoxedScalarVariableDeclaration(statement: StatementNode, context: CFunctionContext): string[] {
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

export function emitBoxedRuntimeValueVariableDeclaration(
  statement: StatementNode,
  expression: StatementNode,
  context: CFunctionContext
): string[] {
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

export function reportCCollectionHashability(
  valueType: string | null | undefined,
  subject: string,
  loc: CSourceLocation,
  context: CFunctionContext
): void {
  if (valueType == null || valueType === 'unknown' || isCCollectionHashableType(valueType)) {
    return
  }

  pushDiagnostic(context,
    diagnostic('CCJS_C_COLLECTION', `${subject} must be hashable in the current C backend slice`, loc)
  )
}

function isCCollectionHashableType(valueType: string): boolean {
  return valueType === 'number' || valueType === 'boolean' || valueType === 'string'
}

function isCForOfArrayElementType(valueType: string): boolean {
  return isCCollectionHashableType(valueType) || valueType === 'object'
}

function emitCollectionVariableDeclaration(statement: StatementNode, context: CFunctionContext): string[] {
  const deps = statementDeps(context)
  const collectionConstructor = deps.collectionConstructorName(statement.init)

  if (collectionConstructor == null) {
    pushDiagnostic(context,
      diagnostic(
        'CCJS_C_COLLECTION',
        'this collection constructor is not supported by the current C backend slice',
        statement.loc
      )
    )
    return [`double ${statement.name} = 0;`]
  }

  if (statement.init.args.length > 1) {
    pushDiagnostic(context,
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

function emitMapConstructorEntries(
  name: string,
  expression: StatementNode | null | undefined,
  context: CFunctionContext,
  loc: CSourceLocation
): string[] {
  const deps = statementDeps(context)

  if (expression == null) {
    return []
  }

  if (expression.type !== 'ArrayLiteral') {
    pushDiagnostic(context,
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
      pushDiagnostic(context,
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

function emitSetConstructorValues(
  name: string,
  expression: StatementNode | null | undefined,
  context: CFunctionContext,
  loc: CSourceLocation
): string[] {
  const deps = statementDeps(context)

  if (expression == null) {
    return []
  }

  if (expression.type !== 'ArrayLiteral') {
    pushDiagnostic(context,
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

function emitDirentArrayIndexVariableDeclaration(statement: StatementNode, context: CFunctionContext): string[] | null {
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

  const index = expression.index.value

  if (!isUnsignedIntegerLiteral(index)) {
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

function emitPreparedForInitializer(init: StatementNode | null | undefined, context: CFunctionContext): PreparedExpression {
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

function emitPreparedForVariableDeclaration(statement: StatementNode, context: CFunctionContext): PreparedExpression {
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

  if (statement.init != null && statement.init.type === 'ObjectLiteral') {
    return {
      lines: deps.emitObjectVariableDeclaration(statement, context),
      expression: ''
    }
  }

  if (statement.init != null && statement.init.type === 'ArrayLiteral') {
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
      let constPrefix = ''

      if (statement.kind === 'const') {
        constPrefix = 'const '
      }

      return {
        lines: [],
        expression: `${constPrefix}ccjs_string* ${statement.name} = ${runtimeString}`
      }
    }

    if (deps.isRuntimeProducedStringExpression(statement.init, context)) {
      return {
        lines: emitRuntimeStringVariableDeclaration(statement, statement.init, context),
        expression: ''
      }
    }

    let constPrefix = ''

    if (statement.kind === 'const') {
      constPrefix = 'const '
    }

    return {
      lines: [],
      expression: `${constPrefix}char* ${statement.name} = ${deps.emitStringExpression(
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

  if (!isNullableScalarType(inferred)) {
    pushDiagnostic(context,
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
  let constPrefix = ''

  if (statement.kind === 'const') {
    constPrefix = 'const '
  }

  return {
    lines: value.lines,
    expression: `${constPrefix}double ${statement.name} = ${value.expression}`
  }
}

function emitPreparedForExpressionClause(
  expression: StatementNode | null | undefined,
  context: CFunctionContext
): PreparedExpression {
  if (expression == null) {
    return {
      lines: [],
      expression: ''
    }
  }

  return emitPreparedConditionExpression(expression, context)
}

function emitPreparedConditionExpression(expression: StatementNode, context: CFunctionContext): PreparedExpression {
  const truthiness = statementDeps(context).emitPreparedRuntimeTruthinessExpression(expression, context)

  if (truthiness != null) {
    return truthiness
  }

  return statementDeps(context).emitPreparedNumberExpression(expression, context)
}

export function emitForOfStatement(statement: StatementNode, context: CFunctionContext): string[] {
  const setup: string[] = []
  let array: KnownForOfArray | null = statementDeps(context).resolveKnownForOfArray(statement.iterable, context)
  let runtimeArray: RuntimeForOfArray | null = null
  let runtimeMap: RuntimeForOfMap | null = null
  let runtimeMapValues: RuntimeForOfMapValues | null = null
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
    runtimeMapValues = statementDeps(context).resolveRuntimeForOfMapValues(statement.iterable, context)
  }

  if (runtimeMapValues != null) {
    return emitRuntimeMapValuesForOfStatement(statement, runtimeMapValues, context)
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
    pushDiagnostic(context,
      diagnostic('CCJS_C_FOR_OF', 'C for-of currently supports arrays, Map values and Set values', statement.loc)
    )
    return []
  }

  let elementType = 'unknown'

  if (runtimeArray != null) {
    elementType = runtimeArray.elementType
  } else if (array != null) {
    elementType = statementDeps(context).resolveForOfElementType(array.elements)
  }

  if (!isCForOfArrayElementType(elementType)) {
    pushDiagnostic(context,
      diagnostic(
        'CCJS_C_FOR_OF',
        'C for-of currently supports only uniform number/boolean/string arrays',
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
    } else if (elementType === 'object') {
      registerObjectShape(context, statement.name, statement.shape)
    }
    const body = withBreakTarget(context, breakLabel, false, () =>
      withContinueTarget(context, continueLabel, false, () => emitScopedStatementBody(statement.body, context, []))
    )
    let declaration = `double ${statement.name} = ${loopValue};`
    const checks: string[] = []

    if (elementType === 'string') {
      declaration = `ccjs_string* ${statement.name} = (ccjs_string*)${value}.as.ref;`
      checks.push(emitRuntimeTypeCheck(`${value}.tag != CCJS_TAG_STRING || ${value}.as.ref == 0`, context))
    } else if (elementType === 'object') {
      declaration = `ccjs_value ${statement.name} = ${value};`
      checks.push(emitRuntimeTypeCheck(`${value}.tag != CCJS_TAG_OBJECT || ${value}.as.ref == 0`, context))
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

function emitRuntimeMapForOfStatement(
  statement: StatementNode,
  runtimeMap: RuntimeForOfMap,
  context: CFunctionContext
): string[] {
  const keyType = stringOrUnknown(runtimeMap.keyType)
  const valueType = stringOrUnknown(runtimeMap.valueType)

  if (!isCCollectionHashableType(keyType) || !isCCollectionHashableType(valueType)) {
    pushDiagnostic(context,
      diagnostic(
        'CCJS_C_FOR_OF',
        'C for-of currently supports only Map entries with number/boolean/string keys and values',
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

function emitRuntimeMapValuesForOfStatement(
  statement: StatementNode,
  runtimeMapValues: RuntimeForOfMapValues,
  context: CFunctionContext
): string[] {
  return emitRuntimeCollectionValueForOfStatement(
    statement,
    runtimeMapValues.name,
    runtimeMapValues.elementType,
    runtimeMapValues.lines,
    'map',
    context
  )
}

function emitRuntimeSetForOfStatement(
  statement: StatementNode,
  runtimeSet: RuntimeForOfSet,
  context: CFunctionContext
): string[] {
  return emitRuntimeCollectionValueForOfStatement(
    statement,
    runtimeSet.name,
    runtimeSet.elementType,
    runtimeSet.lines,
    'set',
    context
  )
}

function emitRuntimeCollectionValueForOfStatement(
  statement: StatementNode,
  collectionName: string,
  elementType: string,
  setupLines: string[],
  collectionKind: string,
  context: CFunctionContext
): string[] {
  const isMap = collectionKind === 'map'
  let unsupported = false
  let unsupportedMessage = 'C for-of currently supports only uniform number/boolean/string Set values'

  if (isMap) {
    unsupportedMessage = 'C for-of currently supports only uniform number/boolean/string/object Map values'

    if (!isCForOfArrayElementType(elementType)) {
      unsupported = true
    }
  } else if (!isCCollectionHashableType(elementType)) {
    unsupported = true
  }

  if (unsupported) {
    pushDiagnostic(context,
      diagnostic(
        'CCJS_C_FOR_OF',
        unsupportedMessage,
        statement.loc
      )
    )
    return []
  }

  let indexPrefix = 'ccjs_for_set_index'
  let collectionPrefix = 'ccjs_for_set'
  let collectionType = 'ccjs_set'
  let slotState = 'CCJS_SET_SLOT_OCCUPIED'

  if (isMap) {
    indexPrefix = 'ccjs_for_map_index'
    collectionPrefix = 'ccjs_for_map'
    collectionType = 'ccjs_map'
    slotState = 'CCJS_MAP_SLOT_OCCUPIED'
  }

  const index = nextCName(context, indexPrefix)
  const collection = nextCName(context, collectionPrefix)
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
    } else if (elementType === 'object') {
      registerObjectShape(context, statement.name, statement.shape)
    }
    const body = withBreakTarget(context, breakLabel, false, () =>
      withContinueTarget(context, continueLabel, false, () => emitScopedStatementBody(statement.body, context, []))
    )
    let declaration = `double ${statement.name} = ${loopValue};`
    const checks: string[] = []

    if (elementType === 'string') {
      declaration = `ccjs_string* ${statement.name} = (ccjs_string*)${value}.as.ref;`
      checks.push(emitRuntimeTypeCheck(`${value}.tag != CCJS_TAG_STRING || ${value}.as.ref == 0`, context))
    } else if (elementType === 'object') {
      declaration = `ccjs_value ${statement.name} = ${value};`
      checks.push(emitRuntimeTypeCheck(`${value}.tag != CCJS_TAG_OBJECT || ${value}.as.ref == 0`, context))
    } else if (elementType === 'boolean') {
      checks.push(emitRuntimeTypeCheck(`${value}.tag != CCJS_TAG_BOOL`, context))
    } else {
      checks.push(emitRuntimeTypeCheck(`${value}.tag != CCJS_TAG_NUMBER`, context))
    }

    const lines: string[] = []
    pushAllLines(lines, setupLines)
    lines.push(`${collectionType}* ${collection} = (${collectionType}*)${collectionName}.as.ref;`)
    lines.push(`for (size_t ${index} = 0; ${index} < ${collection}->cap; ${index} += 1) {`)
    lines.push(`  if (${collection}->entries[${index}].state != ${slotState}) continue;`)
    pushIndentedLines(lines, emitPrepareOwnedValueWrite(value), '  ')
    lines.push(`  ${value} = ${collection}->entries[${index}].value;`)
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

export function emitSwitchStatement(statement: StatementNode, context: CFunctionContext): string[] {
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

function emitSwitchCaseLabel(expression: StatementNode | null | undefined, context: CFunctionContext): string {
  if (expression != null && expression.type === 'NumberLiteral') {
    return `(int)${expression.value}`
  }

  if (expression != null && expression.type === 'BooleanLiteral') {
    if (expression.value) {
      return '(int)1'
    }

    return '(int)0'
  }

  if (expression != null && expression.type === 'UnaryExpression') {
    const argument = expression.argument

    if (argument.type === 'NumberLiteral' && isSwitchCaseUnaryOperator(expression.operator)) {
      return `(int)(${expression.operator}${argument.value})`
    }
  }

  pushDiagnostic(context,
    diagnostic(
      'CCJS_C_SWITCH_CASE',
      'C switch case labels must be numeric or boolean literals in the current backend slice',
      nodeLocOrFallback(expression, null)
    )
  )

  return '0'
}

function isSwitchCaseUnaryOperator(operator: string): boolean {
  return operator === '+' || operator === '-'
}

export function emitTryStatement(statement: StatementNode, context: CFunctionContext): string[] {
  if (
    statement.handler != null &&
    currentErrorTarget(context) != null &&
    containsAwaitExpression(statement.block)
  ) {
    pushDiagnostic(context,
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

export function emitThrowStatement(statement: StatementNode, context: CFunctionContext): string[] {
  const target = currentErrorTarget(context)

  if (target == null && !context.throwingFunction) {
    pushDiagnostic(context,
      diagnostic('CCJS_C_THROW', 'uncaught throw is not supported by the current C backend slice', statement.loc)
    )
    return []
  }

  const isErrorObject = statementDeps(context).isErrorValueExpression(statement.argument, context)

  if (statementDeps(context).inferExpressionType(statement.argument, context) !== 'string' && !isErrorObject) {
    pushDiagnostic(context,
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

export function emitReturnStatement(statement: StatementNode, context: CFunctionContext): string[] {
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

export function emitVariableDeclarationStatement(statement: StatementNode, context: CFunctionContext): string[] {
  const deps = statementDeps(context)

  if (context.moduleValueNames.has(statement.name)) {
    return deps.emitModuleValueVariableAssignment(statement, context)
  }

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

  if (statement.init == null) {
    return deps.emitScalarVariableDeclaration(statement, context)
  }

  const childProcessObject = deps.emitPreparedChildProcessCallExpression(statement.init, context, {
    out: statement.name
  })

  if (
    childProcessObject != null &&
    statement.init != null &&
    statement.init.childProcessRuntimeMethod === 'spawnSync'
  ) {
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

  if (statement.init != null && statement.init.type === 'ObjectLiteral') {
    if (context.boxedMutableCaptureDeclarations.has(statement)) {
      return deps.emitBoxedObjectVariableDeclaration(statement, context)
    }

    return deps.emitObjectVariableDeclaration(statement, context)
  }

  if (statement.init != null && statement.init.type === 'ArrayLiteral') {
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

  if (isDynamicRuntimeValueDeclaration(statement, context)) {
    return emitRuntimeValueVariableDeclaration(statement, statement.init, context, statement.valueType ?? 'unknown')
  }

  if (deps.isIndexAccessExpression(statement.init)) {
    const runtimeElement = deps.resolveRuntimeArrayIndex(statement.init, context)

    if (runtimeElement != null && runtimeElement.valueType === 'object') {
      return emitRuntimeValueVariableDeclaration(statement, statement.init, context)
    }
  }

  if (
    statement.init != null &&
    statement.init.type === 'CallExpression' &&
    statement.nullable !== true &&
    deps.inferExpressionType(statement.init, context) === 'string'
  ) {
    return emitRuntimeStringVariableDeclaration(statement, statement.init, context)
  }

  return deps.emitScalarVariableDeclaration(statement, context)
}

function emitRuntimeStringAssignment(expression: StatementNode, context: CFunctionContext): string[] | null {
  if (expression.target.type !== 'Reference' || expression.target.path.length !== 1) {
    return null
  }

  const target = expression.target.path[0]

  if (!context.runtimeStrings.has(target)) {
    return null
  }

  const deps = statementDeps(context)

  if (
    deps.inferExpressionType(expression.value, context) !== 'string' &&
    !deps.isDynamicRuntimeValueExpression(expression.value, context)
  ) {
    return null
  }

  const value = deps.emitCValueExpression(expression.value, context)
  const lines: string[] = []

  pushAllLines(lines, value.lines)
  lines.push(emitRuntimeValueCheck(value.expression, 'CCJS_TAG_STRING', context))
  lines.push(`${target} = (ccjs_string*)${value.expression}.as.ref;`)

  return lines
}

function isDynamicRuntimeValueDeclaration(statement: StatementNode, context: CFunctionContext): boolean {
  if (!isRuntimeValueDeclarationValueType(statement.valueType)) {
    return false
  }

  return statementDeps(context).isDynamicRuntimeValueExpression(statement.init, context)
}

function isRuntimeValueDeclarationValueType(valueType: string | null | undefined): boolean {
  return (
    valueType === 'unknown' ||
    valueType === 'bytes' ||
    valueType === 'object' ||
    valueType === 'array' ||
    valueType === 'map' ||
    valueType === 'set'
  )
}

export function emitExpressionStatement(statement: StatementNode, context: CFunctionContext): string[] {
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
      pushDiagnostic(context,
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

    const dynamicObjectFieldAssignment = deps.emitDynamicObjectFieldAssignment(statement.expression, context)

    if (dynamicObjectFieldAssignment != null) {
      return dynamicObjectFieldAssignment
    }

    const valueType = deps.inferExpressionType(statement.expression.value, context)

    if (deps.isNullableRuntimeValueAssignment(statement.expression, context)) {
      return deps.emitNullableRuntimeValueAssignment(statement.expression, context)
    }

    if (deps.isBoxedRuntimeValueAssignment(statement.expression, context)) {
      return deps.emitBoxedRuntimeValueAssignment(statement.expression, context)
    }

    const runtimeStringAssignment = emitRuntimeStringAssignment(statement.expression, context)

    if (runtimeStringAssignment != null) {
      return runtimeStringAssignment
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

function normalizeCAsyncReturnArgument(
  argument: StatementNode | null | undefined,
  context: CFunctionContext,
  loc: CSourceLocation
): StatementNode | null | undefined {
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

function isRuntimeCallbackReturnContext(context: CFunctionContext): boolean {
  const returnType = context.runtimeCallbackReturnType

  return (
    context.statusReturn === true &&
    returnType != null &&
    (returnType === 'void' || isNullableScalarType(returnType) || isManagedRuntimeReturnType(returnType))
  )
}

function emitPromiseReturnStatement(statement: StatementNode, context: CFunctionContext): string[] {
  const promise = statementDeps(context).emitPreparedPromiseExpression(statement.argument, context, {
    out: 'ccjs_return',
    owned: false
  })

  if (promise == null) {
    pushDiagnostic(context,
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

function emitRuntimeCallbackReturnStatement(statement: StatementNode, context: CFunctionContext): string[] {
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

function emitRuntimeCallbackScalarReturnLines(
  argument: StatementNode | null | undefined,
  context: CFunctionContext
): string[] {
  let value: PreparedExpression = {
    lines: [],
    expression: '0'
  }

  if (argument != null) {
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

export function emitRuntimeCallbackRuntimeValueReturnLines(
  argument: StatementNode | null | undefined,
  context: CFunctionContext
): string[] {
  if (context.runtimeCallbackReturnType == null || context.runtimeCallbackReturnOut == null) {
    return emitReturnJump(context)
  }

  const expectedTag = cRuntimeValueTag(context.runtimeCallbackReturnType)
  let value: PreparedExpression = {
    lines: [],
    expression: 'ccjs_undefined_value()'
  }

  if (argument != null) {
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

function emitRuntimeReturnValueExpression(
  argument: StatementNode,
  context: CFunctionContext,
  returnType: string,
  returnShape: CObjectShape | null | undefined
): PreparedExpression {
  if (returnType === 'object' && argument.type === 'ObjectLiteral') {
    return statementDeps(context).emitCObjectLiteralValueExpression(argument, context, returnShape)
  }

  return statementDeps(context).emitCValueExpression(argument, context)
}

function emitRuntimeValueReturnStatement(statement: StatementNode, context: CFunctionContext): string[] {
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

function emitNullableScalarReturnStatement(statement: StatementNode, context: CFunctionContext): string[] {
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

export function emitCatchBindingTypeCheck(valueType: string): string {
  if (valueType === 'object') {
    return 'ccjs_error.tag != CCJS_TAG_OBJECT || ccjs_error.as.ref == 0'
  }

  return 'ccjs_error.tag != CCJS_TAG_STRING || ccjs_error.as.ref == 0'
}

export function registerErrorChannel(context: CFunctionContext): void {
  context.errorChannelUsed = true
  registerOwnedValue(context, 'ccjs_error')
}

export function currentErrorTarget(context: CFunctionContext): string | null {
  return lastStringOrNull(context.errorTargets)
}

export function emitBreakJump(context: CFunctionContext): string[] {
  const target = currentBreakTarget(context)

  if (target == null) {
    return ['break;']
  } else {
    const label = target.label

    if (target.throughFinally) {
      registerBreakFlow(context)

      return ['ccjs_break_active = 1;', `goto ${label};`]
    }

    return [`goto ${label};`]
  }
}

export function emitContinueJump(context: CFunctionContext): string[] {
  const target = currentContinueTarget(context)

  if (target == null) {
    return ['continue;']
  } else {
    const label = target.label

    if (target.throughFinally) {
      registerContinueFlow(context)

      return ['ccjs_continue_active = 1;', `goto ${label};`]
    }

    return [`goto ${label};`]
  }
}

export function emitBreakTargetLabel(label: string, context: CFunctionContext): string[] {
  const lines = [`${label}:`]

  if (context.breakFlowUsed) {
    lines.push('  if (ccjs_break_active) ccjs_break_active = 0;')
  }

  lines.push(';')
  return lines
}

export function emitContinueTargetLabel(label: string, context: CFunctionContext): string[] {
  const lines = [`${label}:`]

  if (context.continueFlowUsed) {
    lines.push('  if (ccjs_continue_active) ccjs_continue_active = 0;')
  }

  lines.push('  ;')
  return lines
}

function registerBreakFlow(context: CFunctionContext): void {
  context.breakFlowUsed = true
}

function registerContinueFlow(context: CFunctionContext): void {
  context.continueFlowUsed = true
}

export function currentBreakTarget(context: CFunctionContext): CLoopFlowTarget | null {
  return lastFlowTargetOrNull(context.breakTargets)
}

export function currentContinueTarget(context: CFunctionContext): CLoopFlowTarget | null {
  return lastFlowTargetOrNull(context.continueTargets)
}

export function withBreakTarget(
  context: CFunctionContext,
  label: string | null,
  throughFinally: boolean,
  callback: any
): string[] {
  if (label == null) {
    return callback()
  }

  pushFlowTarget(context.breakTargets, {
    label,
    throughFinally
  })

  const lines = callback()
  popFlowTarget(context.breakTargets)

  return lines
}

export function withContinueTarget(
  context: CFunctionContext,
  label: string | null,
  throughFinally: boolean,
  callback: any
): string[] {
  if (label == null) {
    return callback()
  }

  pushFlowTarget(context.continueTargets, {
    label,
    throughFinally
  })

  const lines = callback()
  popFlowTarget(context.continueTargets)

  return lines
}

export function withFinallyFlowTarget(
  context: CFunctionContext,
  label: string | null,
  callback: any
): string[] {
  return withReturnTarget(context, label, () =>
    withBreakTarget(context, label, true, () => withContinueTarget(context, label, true, callback))
  )
}

export function emitReturnJump(context: CFunctionContext): string[] {
  const target = currentReturnTarget(context)

  if (target != null) {
    registerReturnFlow(context)

    return ['ccjs_return_active = 1;', `goto ${target};`]
  }

  return [emitReturnCleanupStatement(context)]
}

export function emitReturnCleanupStatement(context: CFunctionContext): string {
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

function registerReturnFlow(context: CFunctionContext): void {
  context.returnFlowUsed = true
}

export function currentReturnTarget(context: CFunctionContext): string | null {
  return lastStringOrNull(context.returnTargets)
}

export function withReturnTarget(
  context: CFunctionContext,
  target: string | null,
  callback: any
): string[] {
  if (target == null) {
    return callback()
  }

  pushStringTarget(context.returnTargets, target)

  const lines = callback()
  popStringTarget(context.returnTargets)

  return lines
}

export function withErrorTarget(
  context: CFunctionContext,
  target: string | null,
  callback: any
): string[] {
  if (target == null) {
    return callback()
  }

  pushStringTarget(context.errorTargets, target)

  const lines = callback()
  popStringTarget(context.errorTargets)

  return lines
}
