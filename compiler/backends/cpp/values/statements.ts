import { diagnostic } from '../../../diagnostics.ts'
import {
  compilerLibraryNativeTypeForId,
  compilerLibraryNativeTypeForIntrinsic,
  compilerLibraryOperationForReceiver
} from '../../../extensions/library-set.ts'
import type { AnyNode, SourceLocation } from '../../../types.ts'
import { isRuntimeFunctionType, normalizeFunctionType } from '../async/callbacks.ts'
import type { CFunctionContextWithDependencies } from '../context.ts'
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
import { emitCIdentifier, emitCObjectFunctionFieldName } from '../identifiers.ts'
import {
  emitRuntimeNullableValueCheck,
  emitRuntimeValueCheck,
  emitRuntimeValueCheckLines,
  runtimeObjectLikeTagMismatchCondition,
  runtimeObjectLikeValueMismatchCondition
} from '../runtime-values.ts'
import { runtimeTypeAlternativeValidExpressions } from '../runtime-type-alternatives.ts'
import { cUnsupportedExpressionCode, cUnsupportedVariableDeclarationCode, containsAwaitExpression } from '../syntax.ts'
import type {
  CFunctionParam,
  CFunctionType,
  CKnownObjectField,
  CKnownObjectIndexField,
  CObjectShape,
  CObjectShapeField,
  CPreparedCallOptions as PreparedCallOptions,
  CPreparedFunctionCompanion,
  CPreparedExpression as PreparedExpression
} from '../types.ts'
import { cCompilerLibrarySetValue, cFunctionTypeValue } from '../types.ts'
import {
  applyLibraryNativeValueAdapter,
  cIterableElementDeclaredName,
  cIterableElementValueType,
  cRuntimeValueTag,
  cTypeRefDeclaredName,
  cTypeRefNativeShape,
  compilerLibraryNativeIterationForId,
  compilerLibraryNativeRuntimeValueValidExpressionForTypeId,
  compilerLibraryNativeRuntimeValueValidExpressionForTypeRef,
  isManagedRuntimeReturnType,
  isNullableScalarType,
  isOpaqueRuntimeValueType,
  isRuntimeNullableType,
  libraryNativeBoundaryCppType,
  libraryNativeCppType,
  libraryNativeValueAdapter
} from '../value-types.ts'
import {
  cClassNameFromValueType,
  cClassValueTypeName,
  emitCClassDescriptorNameForClassName,
  emitCClassTypeNameForClassName,
  emitNativeClassFieldAssignment,
  emitPreparedClassInstanceRefValueExpression
} from './classes.ts'
import type { ClassLoweringDependencies } from './classes.ts'
import { emitCConditionClause, emitCNegatedConditionClause, objectExpressionPathName } from './expressions.ts'
import type { NullableLoweringDependencies } from './nullable.ts'
import { emitNullableRuntimeValueVariableDeclaration } from './nullable.ts'
import { registerObjectShape } from './objects.ts'
import type { ObjectVariableDeclarationDependencies } from './objects.ts'
import { isRawStringLiteralExpression } from './strings.ts'
import { anyNodeLikeObjectFieldDeclaredType, isAnyNodeLikeArrayFieldName, isAnyNodeLikeDeclaredType } from './types.ts'

type CSourceLocation = SourceLocation | null | undefined

type StatementNode = AnyNode

type CLoopFlowTarget = {
  label: string
  throughFinally: boolean
  used?: boolean
}

type CVariableTypeNarrowing = {
  name: string
  valueType: string
}

type CTypeofConditionNarrowing = {
  trueTypes: CVariableTypeNarrowing[]
  falseTypes: CVariableTypeNarrowing[]
}

type CCompilerLibraryIteration = {
  doneMember: string
  failureMode: 'thrown' | null
  iteratorMethod: string | null
  nextMethod: string
  receiverAdapter: string | null
  valueAdapter: string | null
  valueMember: string
}

type CFunctionContext = CFunctionContextWithDependencies<
  object,
  ClassLoweringDependencies,
  NullableLoweringDependencies,
  StatementLoweringDependencies,
  object
>

type NullableScalarConditionNarrowing = {
  trueNames: string[]
  falseNames: string[]
}

export type StatementLoweringDependencies = {
  emitArrayVariableDeclaration(statement: StatementNode, context: CFunctionContext): string[]
  emitAwaitValueVariableDeclaration(statement: StatementNode, context: CFunctionContext): string[] | null
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
  emitDynamicObjectMemberVariableDeclaration(
    statement: StatementNode,
    member: CKnownObjectIndexField,
    context: CFunctionContext
  ): string[]
  emitDynamicObjectMemberAssignment(
    expression: StatementNode,
    member: CKnownObjectIndexField,
    context: CFunctionContext
  ): string[]
  emitDynamicObjectFieldAssignment(expression: StatementNode, context: CFunctionContext): string[] | null
  emitFailureStatement(context: CFunctionContext): string
  emitFunctionPointerVariable(
    name: string,
    init: StatementNode,
    context: CFunctionContext,
    isConst: boolean,
    functionType: CFunctionType | null | undefined,
    loc: CSourceLocation
  ): string
  emitFunctionPointerVariableWithCInitializer(
    name: string,
    init: string,
    context: CFunctionContext,
    isConst: boolean,
    functionType: CFunctionType | null | undefined,
    loc: CSourceLocation,
    seenTypes?: string[]
  ): string
  emitKnownObjectMemberAssignment(
    expression: StatementNode,
    member: CKnownObjectField,
    context: CFunctionContext
  ): string[]
  emitKnownObjectMemberVariableDeclaration(
    statement: StatementNode,
    member: CKnownObjectField,
    context: CFunctionContext
  ): string[]
  emitNullableScalarValueExpression(expression: StatementNode, context: CFunctionContext): PreparedExpression
  emitNullableRuntimeValueAssignment(expression: StatementNode, context: CFunctionContext): string[]
  emitObjectVariableDeclaration(
    statement: StatementNode,
    context: CFunctionContext,
    dependencies: ObjectVariableDeclarationDependencies
  ): string[]
  emitObjectFunctionCompanionReference(rootName: string, path: string[], context: CFunctionContext): string | null
  emitOptionalRuntimeCallbackCallExpression(expression: StatementNode, context: CFunctionContext): string[]
  objectVariableDeclarationDependencies: ObjectVariableDeclarationDependencies
  emitPreparedAsyncFunctionAsyncResultCallExpression(
    expression: StatementNode,
    context: CFunctionContext,
    options?: PreparedCallOptions
  ): PreparedExpression | null
  emitPreparedCallExpression(expression: StatementNode, context: CFunctionContext): PreparedExpression
  emitPreparedClassMethodCallExpression(
    expression: StatementNode,
    context: CFunctionContext,
    options?: PreparedCallOptions
  ): PreparedExpression | null
  emitPreparedNumberExpression(expression: StatementNode, context: CFunctionContext): PreparedExpression
  emitPreparedRuntimeTruthinessExpression(
    expression: StatementNode,
    context: CFunctionContext
  ): PreparedExpression | null
  emitPreparedCompilerLibraryCallExpression(
    expression: StatementNode,
    context: CFunctionContext,
    options?: PreparedCallOptions
  ): PreparedExpression | null
  emitPreparedAsyncResultConstructorExpression(
    expression: StatementNode,
    context: CFunctionContext,
    options?: PreparedCallOptions
  ): PreparedExpression | null
  emitPreparedAsyncResultExpression(
    expression: StatementNode,
    context: CFunctionContext,
    options?: PreparedCallOptions
  ): PreparedExpression | null
  emitPreparedAsyncResultChainExpression(
    expression: StatementNode,
    context: CFunctionContext,
    options?: PreparedCallOptions
  ): PreparedExpression | null
  emitPreparedAsyncResultReturningCallExpression(
    expression: StatementNode,
    context: CFunctionContext,
    options?: PreparedCallOptions
  ): PreparedExpression | null
  emitPreparedAsyncResultStaticExpression(
    expression: StatementNode,
    context: CFunctionContext,
    options?: PreparedCallOptions
  ): PreparedExpression | null
  emitPreparedUpdateExpression(expression: StatementNode, context: CFunctionContext): PreparedExpression
  emitAsyncResultConstructorSettlementCall(expression: StatementNode, context: CFunctionContext): string[] | null
  emitReference(expression: StatementNode, context: CFunctionContext): string
  emitModuleValueVariableAssignment(statement: StatementNode, context: CFunctionContext): string[]
  emitRuntimeCallbackVariableDeclaration(statement: StatementNode, context: CFunctionContext): string[]
  emitScalarVariableDeclaration(statement: StatementNode, context: CFunctionContext): string[]
  emitStatement(statement: StatementNode, context: CFunctionContext): string[]
  emitStringExpression(expression: StatementNode, context: CFunctionContext): string
  inferCatchBindingValueType(statement: StatementNode, context: CFunctionContext): string
  inferExpressionType(expression: StatementNode, context: CFunctionContext): string
  isBoxedRuntimeValueAssignment(expression: StatementNode, context: CFunctionContext): boolean
  isClassConstructorExpression(expression: StatementNode, context: CFunctionContext): boolean
  isExceptionValueExpression(expression: StatementNode, context: CFunctionContext): boolean
  isIndexAccessExpression(expression: StatementNode): boolean
  isDynamicRuntimeValueExpression(expression: StatementNode, context: CFunctionContext): boolean
  isMemberAccessExpression(expression: StatementNode): boolean
  isNullableRuntimeValueAssignment(expression: StatementNode, context: CFunctionContext): boolean
  isRuntimeProducedStringExpression(expression: StatementNode, context: CFunctionContext): boolean
  registerExceptionValueShape(context: CFunctionContext, name: string): void
  resolveKnownObjectIndex(expression: StatementNode, context: CFunctionContext): CKnownObjectIndexField | null
  resolveKnownObjectMember(expression: StatementNode, context: CFunctionContext): CKnownObjectField | null
  resolveNullableScalarConditionNarrowing(
    expression: StatementNode,
    context: CFunctionContext
  ): NullableScalarConditionNarrowing
  resolveRuntimeStringReference(expression: StatementNode, context: CFunctionContext): string | null
  emitBoxedRuntimeValueAssignment(expression: StatementNode, context: CFunctionContext): string[]
}

function statementDeps(context: CFunctionContext): StatementLoweringDependencies {
  return context.statementLoweringDependencies
}

function statementChild(value: StatementNode | StatementNode[] | null | undefined): StatementNode | null {
  if (value === null || typeof value === 'undefined' || Array.isArray(value)) {
    return null
  }

  return value
}

function statementNodeArray(value: StatementNode | StatementNode[] | null | undefined): StatementNode[] {
  if (Array.isArray(value)) {
    return value
  }

  return []
}

function resolveStatementConditionNarrowing(
  expression: StatementNode | null | undefined,
  context: CFunctionContext
): NullableScalarConditionNarrowing {
  if (expression === null || typeof expression === 'undefined') {
    return {
      trueNames: [],
      falseNames: []
    }
  }

  return statementDeps(context).resolveNullableScalarConditionNarrowing(expression, context)
}

function pushAllLines(target: string[], source: string[]): void {
  for (const line of source) {
    target.push(line)
  }
}

function objectMemberWithExpressionMetadata(expression: StatementNode, member: CKnownObjectField): CKnownObjectField {
  const valueType = expression.valueType
  const objectUnion =
    typeof valueType === 'string' &&
    valueType.startsWith('union<') &&
    expression.shape !== null &&
    typeof expression.shape !== 'undefined'

  if (
    valueType === null ||
    typeof valueType === 'undefined' ||
    valueType === 'unknown' ||
    (!objectUnion &&
      !isManagedRuntimeReturnType(valueType) &&
      valueType !== 'number' &&
      valueType !== 'boolean' &&
      valueType !== 'function')
  ) {
    return member
  }

  const resolved: CKnownObjectField = {
    ...member,
    valueType: objectUnion ? 'object' : valueType
  }

  if (expression.declaredType !== null && typeof expression.declaredType !== 'undefined') {
    resolved.declaredType = expression.declaredType
  }

  if (expression.typeRef !== null && typeof expression.typeRef !== 'undefined') {
    resolved.typeRef = expression.typeRef
  }

  if (expression.shape !== null && typeof expression.shape !== 'undefined') {
    resolved.shape = expression.shape
  }

  if (expression.functionType !== null && typeof expression.functionType !== 'undefined') {
    resolved.functionType = expression.functionType
  }

  return resolved
}

function joinStrings(values: string[], separator: string): string {
  let result = ''

  for (let index = 0; index < values.length; index = index + 1) {
    if (index > 0) {
      result = result + separator
    }

    result = result + values[index]
  }

  return result
}

function pushIndentedLines(target: string[], source: string[], indent: string): void {
  for (const line of source) {
    if (line === '') {
      target.push('')
      continue
    }

    target.push(`${indent}${line}`)
  }
}

function stripOuterGeneratedScope(lines: string[]): string[] {
  const stripped: string[] = []

  for (let index = 1; index < lines.length - 1; index = index + 1) {
    const line = lines[index]

    if (line.trim() === '') {
      stripped.push('')
      continue
    }

    if (line.slice(0, 2) === '  ') {
      stripped.push(line.slice(2))
    } else {
      stripped.push(line)
    }
  }

  return stripped
}

function pushLoopBodyLines(target: string[], body: string[], indent: string, scoped: boolean): void {
  if (!scoped) {
    pushIndentedLines(target, body, indent)
    return
  }

  target.push(`${indent}{`)
  pushIndentedLines(target, body, `${indent}  `)
  target.push(`${indent}}`)
}

function constPrefix(_isConst: boolean): string {
  return ''
}

function stringOrUnknown(value: string | null | undefined): string {
  if (value !== null && typeof value !== 'undefined') {
    return value
  }

  return 'unknown'
}

function stringOrNull(value: string | null | undefined): string | null {
  if (value !== null && typeof value !== 'undefined') {
    return value
  }

  return null
}

function functionTypeFromArrowFunctionExpression(expression: StatementNode | null | undefined): CFunctionType | null {
  if (expression === null || typeof expression === 'undefined' || expression.type !== 'ArrowFunctionExpression') {
    return null
  }

  const params: CFunctionParam[] = []
  let returnShape: CObjectShape | null = null
  let returnType = stringOrNull(expression.returnType)

  if (expression.returnShape !== null && typeof expression.returnShape !== 'undefined') {
    returnShape = expression.returnShape
  } else if (
    expression.body !== null &&
    typeof expression.body !== 'undefined' &&
    expression.body.shape !== null &&
    typeof expression.body.shape !== 'undefined'
  ) {
    returnShape = expression.body.shape
  }

  if (
    (returnType === null || typeof returnType === 'undefined') &&
    expression.expressionBody === true &&
    expression.body !== null &&
    typeof expression.body !== 'undefined'
  ) {
    returnType = stringOrNull(expression.body.valueType)

    if (returnType === null || typeof returnType === 'undefined') {
      if (expression.body.type === 'NumberLiteral') {
        returnType = 'number'
      } else if (expression.body.type === 'BooleanLiteral') {
        returnType = 'boolean'
      } else if (expression.body.type === 'StringLiteral' || expression.body.type === 'TemplateLiteral') {
        returnType = 'string'
      }
    }
  }

  if ((returnType === null || typeof returnType === 'undefined') && expression.expressionBody !== true) {
    returnType = 'void'
  }

  if (expression.params !== null && typeof expression.params !== 'undefined') {
    for (const param of expression.params as CFunctionParam[]) {
      params.push(param)
    }
  }

  return {
    kind: 'function',
    params,
    returnTypeRef: expression.returnTypeRef ?? null,
    returnNullable: expression.returnNullable === true,
    returnAsyncResultValueType: stringOrNull(expression.returnAsyncResultValueType),
    returnShape,
    returnType: stringOrUnknown(returnType)
  }
}

function scalarDeclarationFunctionType(statement: StatementNode): CFunctionType | null {
  if (statement.functionType !== null && typeof statement.functionType !== 'undefined') {
    return statement.functionType
  }

  if (
    statement.init !== null &&
    typeof statement.init !== 'undefined' &&
    statement.init.functionType !== null &&
    typeof statement.init.functionType !== 'undefined'
  ) {
    return statement.init.functionType
  }

  return functionTypeFromArrowFunctionExpression(statement.init)
}

function nodeLocOrFallback(node: StatementNode | null | undefined, fallback: CSourceLocation): CSourceLocation {
  if (node !== null && typeof node !== 'undefined' && node.loc !== null && typeof node.loc !== 'undefined') {
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

  for (let index = 0; index < statements.length; index = index + 1) {
    const statement: StatementNode = statements[index]

    if (statement.type === 'TryStatement' && index > 0) {
      pushStatementListBlankLine(result)
    }

    const lines = emitStatementListItem(statement, context)
    pushAllLines(result, lines)

    if (statement.type === 'TryStatement' && index < statements.length - 1) {
      pushStatementListBlankLine(result)
    }

    applyNullableScalarEarlyReturnNarrowing(statement, context)
  }

  const output = result

  return output
}

function pushStatementListBlankLine(lines: string[]): void {
  if (lines.length === 0 || lines[lines.length - 1].trim() === '') {
    return
  }

  lines.push('')
}

function emitStatementListItem(statement: StatementNode, context: CFunctionContext): string[] {
  const deps = statementDeps(context)
  const lines = deps.emitStatement(statement, context)

  return lines
}

function applyNullableScalarEarlyReturnNarrowing(statement: StatementNode, context: CFunctionContext): void {
  const consequent = statementChild(statement.consequent)
  const alternate = statementChild(statement.alternate)

  if (statement.type !== 'IfStatement' || alternate !== null || !statementDefinitelyReturns(consequent)) {
    return
  }

  const narrowing = resolveStatementConditionNarrowing(statement.condition, context)

  narrowNullableScalars(context, narrowing.falseNames)
}

function statementDefinitelyReturns(statement: StatementNode | null | undefined): boolean {
  if (statement === null || typeof statement === 'undefined') {
    return false
  }

  if (statement.type === 'ReturnStatement') {
    return true
  }

  if (statement.type === 'BlockStatement') {
    return statementBodyDefinitelyReturns(statement.body)
  }

  if (statement.type === 'IfStatement') {
    const consequent = statementChild(statement.consequent)
    const alternate = statementChild(statement.alternate)

    if (alternate !== null) {
      return statementDefinitelyReturns(consequent) && statementDefinitelyReturns(alternate)
    }
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

function preparedCallOut(name: string): PreparedCallOptions {
  return {
    out: emitCIdentifier(name)
  }
}

function preparedAsyncResultReturnOptions(): PreparedCallOptions {
  return {
    out: 'inox_return',
    owned: false
  }
}

function returnStatementWithArgument(
  statement: StatementNode,
  argument: StatementNode | null | undefined
): StatementNode {
  return {
    type: statement.type,
    argument,
    loc: statement.loc
  }
}

function nullRuntimeValueExpression(): PreparedExpression {
  return {
    lines: [],
    expression: 'inox_null_value()'
  }
}

function applyVariableTypeNarrowings(context: CFunctionContext, narrowings: CVariableTypeNarrowing[]): void {
  for (let index = 0; index < narrowings.length; index = index + 1) {
    const narrowing = narrowings[index]

    context.variables.set(narrowing.name, narrowing.valueType)
  }
}

function emptyTypeofConditionNarrowing(): CTypeofConditionNarrowing {
  return {
    trueTypes: [],
    falseTypes: []
  }
}

function resolveTypeofConditionNarrowing(expression: StatementNode | null | undefined): CTypeofConditionNarrowing {
  if (
    expression === null ||
    typeof expression === 'undefined' ||
    expression.type !== 'BinaryExpression' ||
    (expression.operator !== '===' && expression.operator !== '!==')
  ) {
    return emptyTypeofConditionNarrowing()
  }

  const direct = resolveTypeofComparisonNarrowing(expression.left, expression.right)
  const narrowing = direct ?? resolveTypeofComparisonNarrowing(expression.right, expression.left)

  if (narrowing === null || typeof narrowing === 'undefined') {
    return emptyTypeofConditionNarrowing()
  }

  if (expression.operator === '!==') {
    return {
      trueTypes: [],
      falseTypes: [narrowing]
    }
  }

  return {
    trueTypes: [narrowing],
    falseTypes: []
  }
}

function resolveTypeofComparisonNarrowing(
  typeofExpression: StatementNode | null | undefined,
  literal: StatementNode | null | undefined
): CVariableTypeNarrowing | null {
  if (
    typeofExpression === null ||
    typeof typeofExpression === 'undefined' ||
    literal === null ||
    typeof literal === 'undefined' ||
    typeofExpression.type !== 'UnaryExpression' ||
    typeofExpression.operator !== 'typeof' ||
    literal.type !== 'StringLiteral'
  ) {
    return null
  }

  const argument = typeofExpression.argument

  if (
    argument === null ||
    typeof argument === 'undefined' ||
    argument.type !== 'Reference' ||
    argument.path.length !== 1 ||
    !isSupportedTypeofNarrowingType(literal.value)
  ) {
    return null
  }

  return {
    name: argument.path[0],
    valueType: literal.value
  }
}

function isSupportedTypeofNarrowingType(valueType: string): boolean {
  return valueType === 'number' || valueType === 'string' || valueType === 'boolean' || valueType === 'function'
}

function emitScopedStatementBody(
  statement: StatementNode | null | undefined,
  context: CFunctionContext,
  narrowedNames: string[],
  variableTypeNarrowings: CVariableTypeNarrowing[]
): string[] {
  if (statement === null || typeof statement === 'undefined') {
    return []
  }

  const variableScope = pushVariableScope(context)
  const nullableScope = pushNullableScalarNarrowing(context, narrowedNames)
  applyVariableTypeNarrowings(context, variableTypeNarrowings)
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
  const consequent = statementChild(statement.consequent)
  const alternate = statementChild(statement.alternate)
  const condition = emitPreparedConditionExpression(statement.condition, context)
  const narrowing = resolveStatementConditionNarrowing(statement.condition, context)
  const typeNarrowing = resolveTypeofConditionNarrowing(statement.condition)
  const lines: string[] = []
  pushAllLines(lines, condition.lines)
  lines.push(`if ${emitCConditionClause(condition.expression)} {`)
  pushIndentedLines(
    lines,
    emitScopedStatementBody(consequent, context, narrowing.trueNames, typeNarrowing.trueTypes),
    '  '
  )

  if (alternate === null) {
    lines.push('}')
    return lines
  }

  lines.push('} else {')
  pushIndentedLines(
    lines,
    emitScopedStatementBody(alternate, context, narrowing.falseNames, typeNarrowing.falseTypes),
    '  '
  )
  lines.push('}')

  return lines
}

export function emitWhileStatement(statement: StatementNode, context: CFunctionContext): string[] {
  const condition = emitPreparedConditionExpression(statement.condition, context)
  const narrowing = resolveStatementConditionNarrowing(statement.condition, context)
  const typeNarrowing = resolveTypeofConditionNarrowing(statement.condition)
  const breakTarget: CLoopFlowTarget = { label: nextCName(context, 'inox_break'), throughFinally: false }
  const continueTarget: CLoopFlowTarget = { label: nextCName(context, 'inox_continue'), throughFinally: false }
  pushFlowTarget(context.breakTargets, breakTarget)
  pushFlowTarget(context.continueTargets, continueTarget)
  const body = emitScopedStatementBody(statement.body, context, narrowing.trueNames, typeNarrowing.trueTypes)
  popFlowTarget(context.continueTargets)
  popFlowTarget(context.breakTargets)

  if (condition.lines.length === 0) {
    const lines: string[] = []
    const hasContinueLabel = shouldEmitFlowTargetLabel(continueTarget)
    lines.push(`while ${emitCConditionClause(condition.expression)} {`)
    pushLoopBodyLines(lines, body, '  ', hasContinueLabel)
    if (hasContinueLabel) {
      pushAllLines(lines, emitContinueTargetLabel(continueTarget.label, context))
    }
    lines.push('}')
    if (shouldEmitFlowTargetLabel(breakTarget)) {
      pushAllLines(lines, emitBreakTargetLabel(breakTarget.label, context))
    }

    return lines
  }

  const lines: string[] = []
  const hasContinueLabel = shouldEmitFlowTargetLabel(continueTarget)
  lines.push('while (1) {')
  pushIndentedLines(lines, condition.lines, '  ')
  lines.push(`  if ${emitCNegatedConditionClause(condition.expression)} break;`)
  pushLoopBodyLines(lines, body, '  ', hasContinueLabel)
  if (hasContinueLabel) {
    pushAllLines(lines, emitContinueTargetLabel(continueTarget.label, context))
  }
  lines.push('}')
  if (shouldEmitFlowTargetLabel(breakTarget)) {
    pushAllLines(lines, emitBreakTargetLabel(breakTarget.label, context))
  }

  return lines
}

export function emitForStatement(statement: StatementNode, context: CFunctionContext): string[] {
  const variableScope = pushVariableScope(context)

  try {
    const init = emitPreparedForInitializer(statement.init, context)
    const testExpression = statementChild(statement.test)
    const test = emitPreparedForExpressionClause(testExpression, context)
    const update = emitPreparedForExpressionClause(statement.update, context)
    const narrowing = resolveStatementConditionNarrowing(testExpression, context)
    const typeNarrowing = resolveTypeofConditionNarrowing(testExpression)
    const breakTarget: CLoopFlowTarget = { label: nextCName(context, 'inox_break'), throughFinally: false }
    const continueTarget: CLoopFlowTarget = { label: nextCName(context, 'inox_continue'), throughFinally: false }
    pushFlowTarget(context.breakTargets, breakTarget)
    pushFlowTarget(context.continueTargets, continueTarget)
    const body = emitScopedStatementBody(statement.body, context, narrowing.trueNames, typeNarrowing.trueTypes)
    popFlowTarget(context.continueTargets)
    popFlowTarget(context.breakTargets)
    const needsPreparedLowering = init.lines.length > 0 || test.lines.length > 0 || update.lines.length > 0

    if (!needsPreparedLowering) {
      const lines: string[] = []
      const hasContinueLabel = shouldEmitFlowTargetLabel(continueTarget)
      lines.push(`for (${init.expression}; ${test.expression}; ${update.expression}) {`)
      pushLoopBodyLines(lines, body, '  ', hasContinueLabel)
      if (hasContinueLabel) {
        pushAllLines(lines, emitContinueTargetLabel(continueTarget.label, context))
      }
      lines.push('}')
      if (shouldEmitFlowTargetLabel(breakTarget)) {
        pushAllLines(lines, emitBreakTargetLabel(breakTarget.label, context))
      }

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

    const hasContinueLabel = shouldEmitFlowTargetLabel(continueTarget)
    pushLoopBodyLines(lines, body, '    ', hasContinueLabel)
    if (hasContinueLabel) {
      pushIndentedLines(lines, emitContinueTargetLabel(continueTarget.label, context), '  ')
    }
    pushIndentedLines(lines, update.lines, '    ')

    if (update.expression !== '') {
      lines.push(`    ${update.expression};`)
    }

    lines.push('  }')
    if (shouldEmitFlowTargetLabel(breakTarget)) {
      pushIndentedLines(lines, emitBreakTargetLabel(breakTarget.label, context), '  ')
    }
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

  if (statement.kind === 'const' && value.cppType === 'inox::String') {
    const name = emitCIdentifier(statement.name)
    const declaredName = value.cppDeclaredName

    if (
      declaredName !== null &&
      typeof declaredName !== 'undefined' &&
      declaredName !== name &&
      value.expression === declaredName
    ) {
      for (const line of value.lines) {
        lines.push(replacePreparedCppDeclaredName(line, declaredName, name))
      }
    } else {
      pushAllLines(lines, value.lines)
      lines.push(`auto ${name} = ${value.expression};`)
    }

    if (!shouldSkipRuntimeValueDeclarationCheck(statement, value, 'string')) {
      lines.push(emitRuntimeTypeCheck(`!${name}.valid()`, context))
    }
    pushAwaitVariableDeclarationSpacing(lines, expression)

    context.variables.set(statement.name, 'string')
    context.cppStringValues.add(statement.name)

    return lines
  }

  const storage = registerRuntimeStringStorage(statement.name, context)

  pushAllLines(lines, value.lines)
  lines.push(`${storage} = ${value.expression};`)
  pushPreparedRuntimeValueOwnershipLines(lines, storage, value)

  if (!shouldSkipRuntimeValueDeclarationCheck(statement, value, 'string')) {
    lines.push(emitRuntimeValueCheck(storage, 'INOX_TAG_STRING', context))
  }

  lines.push(
    `${constPrefix(statement.kind === 'const')}inox_string* ${emitCIdentifier(statement.name)} = (inox_string*)${storage}.as.ref;`
  )

  context.variables.set(statement.name, 'string')
  context.runtimeStrings.add(statement.name)

  return lines
}

export function emitStringScalarVariableDeclaration(
  statement: StatementNode,
  context: CFunctionContext,
  inferred: string
): string[] | null {
  if (inferred !== 'string') {
    return null
  }

  const deps = statementDeps(context)

  if (context.boxedMutableCaptureDeclarations.has(statement)) {
    return emitBoxedRuntimeValueVariableDeclaration(statement, statement.init, context)
  }

  const runtimeString = deps.resolveRuntimeStringReference(statement.init, context)

  if (runtimeString !== null && typeof runtimeString !== 'undefined') {
    context.runtimeStrings.add(statement.name)
    return [
      `${constPrefix(statement.kind === 'const')}inox_string* ${emitCIdentifier(statement.name)} = ${runtimeString};`
    ]
  }

  const forcedRuntimeStrings = context.forceRuntimeStringDeclarations

  if (forcedRuntimeStrings !== null && typeof forcedRuntimeStrings !== 'undefined') {
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

  return [
    `${constPrefix(statement.kind === 'const')}char* ${emitCIdentifier(statement.name)} = ${deps.emitStringExpression(statement.init, context)};`
  ]
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
  const functionType = scalarDeclarationFunctionType(statement)
  const callbackWrapper = context.callbackArrowWrappers.get(statement.init)

  if (functionType !== null && typeof functionType !== 'undefined') {
    statement.functionType = functionType

    if (statement.init !== null && typeof statement.init !== 'undefined') {
      statement.init.functionType = functionType
    }
  }

  if (callbackWrapper !== null && typeof callbackWrapper !== 'undefined' && callbackWrapper.kind === 'arrow') {
    runtimeFunctionType = normalizeFunctionType(functionType)
  }

  context.variables.set(statement.name, 'function')
  if (runtimeFunctionType !== null && typeof runtimeFunctionType !== 'undefined') {
    context.functionTypes.set(statement.name, runtimeFunctionType)
  } else {
    context.functionTypes.set(statement.name, normalizeFunctionType(functionType))
  }

  if (
    isRuntimeFunctionType(functionType) ||
    (runtimeFunctionType !== null && typeof runtimeFunctionType !== 'undefined')
  ) {
    return deps.emitRuntimeCallbackVariableDeclaration(statement, context)
  }

  return [
    `${deps.emitFunctionPointerVariable(
      statement.name,
      statement.init,
      context,
      statement.kind === 'const',
      functionType,
      statement.loc
    )};`
  ]
}

export function emitNumberBooleanScalarVariableDeclaration(
  statement: StatementNode,
  context: CFunctionContext,
  inferred: string
): string[] {
  if (inferred === 'function') {
    const functionDeclaration = emitFunctionScalarVariableDeclaration(statement, context, inferred)

    if (functionDeclaration !== null && typeof functionDeclaration !== 'undefined') {
      return functionDeclaration
    }
  }

  if ((inferred === 'number' || inferred === 'boolean') && context.boxedMutableCaptureDeclarations.has(statement)) {
    return emitBoxedScalarVariableDeclaration(statement, context)
  }

  if (!isNullableScalarType(inferred)) {
    pushDiagnostic(
      context,
      diagnostic(
        cUnsupportedExpressionCode(inferred),
        'this expression is not supported by the current C++ backend slice',
        statement.loc
      )
    )
    return [`double ${emitCIdentifier(statement.name)} = 0;`]
  }

  const deps = statementDeps(context)
  const dynamicObjectField = emitDynamicObjectScalarVariableDeclaration(statement, inferred, context)

  if (dynamicObjectField !== null && typeof dynamicObjectField !== 'undefined') {
    return dynamicObjectField
  }

  const value = deps.emitPreparedNumberExpression(statement.init, context)
  const lines: string[] = []
  pushAllLines(lines, value.lines)
  lines.push(
    `${constPrefix(statement.kind === 'const')}double ${emitCIdentifier(statement.name)} = ${value.expression};`
  )
  pushAwaitVariableDeclarationSpacing(lines, statement.init)

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
  lines.push(
    `${constPrefix(statement.kind === 'const')}double ${emitCIdentifier(statement.name)} = ${runtimeValueExpression};`
  )

  return lines
}

function isDynamicObjectScalarFieldInitializer(expression: StatementNode, context: CFunctionContext): boolean {
  const deps = statementDeps(context)

  if (deps.isMemberAccessExpression(expression)) {
    if (
      !deps.resolveKnownObjectMember(expression, context) &&
      deps.inferExpressionType(expression.object, context) === 'object'
    ) {
      return true
    }

    return isDynamicObjectScalarFieldInitializer(expression.object, context)
  }

  if (deps.isIndexAccessExpression(expression) && expression.index.type === 'StringLiteral') {
    if (
      !deps.resolveKnownObjectIndex(expression, context) &&
      deps.inferExpressionType(expression.object, context) === 'object'
    ) {
      return true
    }

    return isDynamicObjectScalarFieldInitializer(expression.object, context)
  }

  return deps.isDynamicRuntimeValueExpression(expression, context)
}

export function emitRuntimeValueVariableDeclaration(
  statement: StatementNode,
  expression: StatementNode,
  context: CFunctionContext,
  valueTypeOverride?: string | null,
  nativeShapeOverride?: CObjectShape | null
): string[] {
  let valueType = valueTypeOverride ?? statementDeps(context).inferExpressionType(expression, context)
  const statementValueType = statement.valueType

  if (statement.declaredType === 'unknown') {
    valueType = 'unknown'
  }

  if (
    valueType === 'unknown' &&
    statementValueType !== null &&
    typeof statementValueType !== 'undefined' &&
    isRuntimeValueDeclarationValueType(statementValueType)
  ) {
    valueType = statementValueType
  }

  const nativeShape =
    nativeShapeOverride ??
    statement.shape ??
    cTypeRefNativeShape(statement.typeRef, context.libraries) ??
    cTypeRefNativeShape(expression.typeRef, context.libraries)
  const nativeCppType = libraryNativeBoundaryCppType(valueType, statement.nullable === true, false, nativeShape)
  const expectedTag = valueType === 'object' && nativeCppType !== null ? null : cRuntimeValueTag(valueType)
  const runtimeTypeAlternatives = statement.runtimeTypeAlternatives ?? expression.runtimeTypeAlternatives
  let nativeValidExpression = compilerLibraryNativeRuntimeValueValidExpressionForTypeRef(
    context.libraries,
    statement.typeRef
  )

  if (nativeValidExpression === null) {
    nativeValidExpression = compilerLibraryNativeRuntimeValueValidExpressionForTypeRef(
      context.libraries,
      expression.typeRef
    )
  }
  let objectLiteralExpression = false

  if (valueType === 'object') {
    if (expression.type === 'ObjectLiteral') {
      objectLiteralExpression = true
    }
  }

  let value = statementDeps(context).emitCValueExpression(expression, context)

  if (nativeCppType !== null && value.cppType !== nativeCppType) {
    const adapter = libraryNativeValueAdapter(nativeShape)

    if (adapter === null) {
      pushDiagnostic(
        context,
        diagnostic(
          'INOX_C_LIBRARY_NATIVE_VALUE_ADAPTER',
          'runtime-backed native variable requires a package C++ value adapter',
          expression.loc
        )
      )
    } else {
      value = {
        ...value,
        expression: applyLibraryNativeValueAdapter(value.expression, adapter),
        cppType: nativeCppType,
        valueType: 'object'
      }
    }
  }

  if (objectLiteralExpression) {
    value = statementDeps(context).emitCObjectLiteralValueExpression(expression, context, statement.shape)
  }

  registerRuntimeValueMetadata(statement.name, valueType, statement, expression, context)
  registerCppValueType(statement.name, value.cppType, value.valueType ?? valueType, context)

  const lines: string[] = []
  pushAllLines(lines, value.lines)
  lines.push(emitLocalRuntimeValueDeclaration(statement, value))
  pushRuntimeValueFunctionCompanionDeclarations(lines, statement, value, context)

  if (shouldSkipRuntimeValueDeclarationCheck(statement, value, valueType)) {
    pushAwaitVariableDeclarationSpacing(lines, expression)
    return lines
  }

  if (nativeValidExpression !== null) {
    const name = emitCIdentifier(statement.name)
    const valid = nativeValidExpression.split('$value').join(name)
    const mismatch =
      statement.nullable === true
        ? `${name}.tag != INOX_TAG_UNDEFINED && ${name}.tag != INOX_TAG_NULL && !(${valid})`
        : `!(${valid})`
    lines.push(emitRuntimeTypeCheck(mismatch, context))
  } else if (runtimeTypeAlternatives !== null && typeof runtimeTypeAlternatives !== 'undefined') {
    const validExpressions = runtimeTypeAlternativeValidExpressions(
      runtimeTypeAlternatives,
      emitCIdentifier(statement.name),
      context.libraries
    )

    if (validExpressions !== null && validExpressions.length > 0) {
      const name = emitCIdentifier(statement.name)
      const valid = validExpressions.join(' || ')
      const mismatch =
        statement.nullable === true
          ? `${name}.tag != INOX_TAG_UNDEFINED && ${name}.tag != INOX_TAG_NULL && !(${valid})`
          : `!(${valid})`

      lines.push(emitRuntimeTypeCheck(mismatch, context))
    }
  } else if (statement.nullable === true && isRuntimeNullableType(valueType)) {
    pushAllLines(lines, emitRuntimeNullableValueCheck(emitCIdentifier(statement.name), expectedTag, context))
  } else {
    const valueCheck = emitRuntimeValueCheck(emitCIdentifier(statement.name), expectedTag, context)

    if (valueCheck !== '') {
      lines.push(valueCheck)
    }
  }

  pushAwaitVariableDeclarationSpacing(lines, expression)

  return lines
}

function pushRuntimeValueFunctionCompanionDeclarations(
  lines: string[],
  statement: StatementNode,
  value: PreparedExpression,
  context: CFunctionContext
): void {
  const companions = value.functionCompanions

  if (companions === null || typeof companions === 'undefined') {
    return
  }

  for (const companion of companions) {
    const name = objectFunctionCompanionName(statement.name, companion.path)

    if (name === null) {
      continue
    }

    lines.push(
      `${statementDeps(context).emitFunctionPointerVariableWithCInitializer(
        name,
        companion.expression,
        context,
        statement.kind === 'const',
        cFunctionTypeValue(companion.functionType),
        statement.loc,
        companion.seenTypes
      )};`
    )
  }
}

function objectFunctionCompanionName(root: string, path: string[]): string | null {
  if (path.length === 0) {
    return null
  }

  let objectName = root

  for (let index = 0; index + 1 < path.length; index = index + 1) {
    objectName = `${objectName}_${path[index]}`
  }

  return emitCObjectFunctionFieldName(objectName, path[path.length - 1])
}

function pushAwaitVariableDeclarationSpacing(lines: string[], expression: StatementNode): void {
  if (expression.type === 'AwaitExpression') {
    lines.push('')
  }
}

function replacePreparedCppDeclaredName(line: string, declaredName: string, name: string): string {
  return line.split(declaredName).join(name)
}

function emitLocalRuntimeValueDeclaration(statement: StatementNode, value: PreparedExpression): string {
  const name = emitCIdentifier(statement.name)
  const cppType = value.cppType ?? 'inox::Value'
  let declarationType = `${constPrefix(statement.kind === 'const')}${cppType}`

  if (cppType !== 'inox::Value') {
    declarationType = 'auto'
  }

  if (value.owned === true) {
    return `${declarationType} ${name} = inox::adopt(${value.expression}.release());`
  }

  return `${declarationType} ${name} = ${value.expression};`
}

function registerCppValueType(
  name: string,
  cppType: string | null | undefined,
  valueType: string | null | undefined,
  context: CFunctionContext
): void {
  if (typeof cppType === 'string' && isManagedRuntimeReturnType(valueType)) {
    context.cppValueTypes.set(name, cppType)
    return
  }

  context.cppValueTypes.delete(name)
}

function shouldSkipRuntimeValueDeclarationCheck(
  statement: StatementNode,
  value: PreparedExpression,
  valueType: string
): boolean {
  if (statement.nullable === true) {
    return false
  }

  if (
    value.cppType !== null &&
    typeof value.cppType !== 'undefined' &&
    value.cppType !== 'inox::Value' &&
    isManagedRuntimeReturnType(valueType)
  ) {
    return true
  }

  return value.runtimeTypeChecked === true && value.valueType === valueType
}

function pushPreparedRuntimeValueOwnershipLines(lines: string[], target: string, value: PreparedExpression): void {
  if (value.owned === true) {
    if (value.expression !== target) {
      lines.push(`${value.expression} = inox_undefined_value();`)
    }

    return
  }
}

export function registerRuntimeValueMetadata(
  name: string,
  valueType: string,
  declaration: StatementNode,
  expression: StatementNode | null | undefined,
  context: CFunctionContext
): void {
  context.variables.set(name, valueType)
  context.runtimeValueStorageNames.add(name)

  if (declaration.nullable === true && isRuntimeNullableType(valueType)) {
    context.nullableVariables.add(name)
  } else {
    context.nullableVariables.delete(name)
  }

  if (valueType === 'object') {
    registerObjectShape(context, name, resolveRuntimeObjectShape(declaration, expression, context))
    registerObjectAlias(context, name, expression)
    registerRuntimeObjectDeclaredType(context, name, declaration, expression)
  }
}

function registerRuntimeObjectDeclaredType(
  context: CFunctionContext,
  name: string,
  declaration: StatementNode,
  expression: StatementNode | null | undefined
): void {
  const declaredType = resolveRuntimeObjectDeclaredType(declaration, expression, context)

  if (declaredType !== null && typeof declaredType !== 'undefined') {
    context.objectDeclaredTypes.set(name, declaredType)
  } else {
    context.objectDeclaredTypes.delete(name)
  }
}

function resolveRuntimeObjectDeclaredType(
  declaration: StatementNode,
  expression: StatementNode | null | undefined,
  context: CFunctionContext
): string | null {
  const declarationType =
    knownDeclaredType(declaration.inferredDeclaredType) ?? knownDeclaredType(declaration.declaredType)

  if (declarationType !== null && typeof declarationType !== 'undefined') {
    return declarationType
  }

  const declarationBuiltin = knownRuntimeObjectBuiltin(declaration.shape)

  if (declarationBuiltin !== null && typeof declarationBuiltin !== 'undefined') {
    return declarationBuiltin
  }

  if (expression !== null && typeof expression !== 'undefined') {
    const expressionType = knownDeclaredType(expression.declaredType)

    if (expressionType !== null && typeof expressionType !== 'undefined') {
      return expressionType
    }

    const expressionBuiltin = knownRuntimeObjectBuiltin(expression.shape)

    if (expressionBuiltin !== null && typeof expressionBuiltin !== 'undefined') {
      return expressionBuiltin
    }

    return anyNodeLikeObjectAccessDeclaredType(expression, context)
  }

  return null
}

function knownRuntimeObjectBuiltin(shape: CObjectShape | null | undefined): string | null {
  const builtin = shape?.builtin

  if (builtin === null || typeof builtin === 'undefined' || builtin === '' || builtin === 'compiler.AnyNode') {
    return null
  }

  return builtin
}

function knownDeclaredType(value: string | null | undefined): string | null {
  if (value === null || typeof value === 'undefined' || value === '' || value === 'unknown') {
    return null
  }

  return value
}

function anyNodeLikeObjectAccessDeclaredType(expression: StatementNode, context: CFunctionContext): string | null {
  const root = objectAccessRootName(expression)

  if (root === null || typeof root === 'undefined') {
    return null
  }

  const rootDeclaredType = context.objectDeclaredTypes.get(root)

  if (
    rootDeclaredType === null ||
    typeof rootDeclaredType === 'undefined' ||
    !isAnyNodeLikeDeclaredType(rootDeclaredType)
  ) {
    return null
  }

  const field = objectAccessFieldName(expression)

  if (field === null || typeof field === 'undefined') {
    return null
  }

  return anyNodeLikeObjectFieldDeclaredType(field)
}

function variableDeclarationNativeShape(statement: StatementNode, context: CFunctionContext): CObjectShape | null {
  const declaredShape =
    statement.shape ??
    cTypeRefNativeShape(statement.typeRef, context.libraries) ??
    cTypeRefNativeShape(statement.init?.typeRef, context.libraries)

  if (declaredShape !== null && typeof declaredShape !== 'undefined' && libraryNativeCppType(declaredShape) !== null) {
    return declaredShape
  }

  const expression = statement.init

  if (expression === null || typeof expression === 'undefined') {
    return null
  }

  const root = objectAccessRootName(expression)
  const field = objectAccessFieldName(expression)

  if (root === null || field === null || !isAnyNodeLikeArrayFieldName(field)) {
    return null
  }

  const rootDeclaredType = context.objectDeclaredTypes.get(root) ?? objectAccessRootDeclaredType(expression)

  if (
    rootDeclaredType === null ||
    typeof rootDeclaredType === 'undefined' ||
    !isAnyNodeLikeDeclaredType(rootDeclaredType)
  ) {
    return null
  }

  const nativeType = compilerLibraryNativeTypeForIntrinsic(
    cCompilerLibrarySetValue(context.libraries),
    'array-literal',
    'construct'
  )

  if (nativeType === null) {
    return null
  }

  return {
    fields: [],
    libraryCValueAdapter: nativeType.cValueAdapter ?? null,
    libraryCppType: nativeType.cppType,
    libraryTypeId: nativeType.typeId
  }
}

function objectAccessRootDeclaredType(expression: StatementNode): string | null {
  let current: StatementNode = expression

  while (
    current.type === 'MemberExpression' ||
    current.type === 'OptionalMemberExpression' ||
    current.type === 'IndexExpression' ||
    current.type === 'OptionalIndexExpression'
  ) {
    current = current.object
  }

  return knownDeclaredType(current.declaredType)
}

function objectAccessRootName(expression: StatementNode): string | null {
  let current: StatementNode = expression

  while (
    current.type === 'MemberExpression' ||
    current.type === 'OptionalMemberExpression' ||
    current.type === 'IndexExpression' ||
    current.type === 'OptionalIndexExpression'
  ) {
    current = current.object
  }

  if (current.type !== 'Reference') {
    return null
  }

  const path: string[] = current.path

  if (path.length !== 1) {
    return null
  }

  return path[0]
}

function objectAccessFieldName(expression: StatementNode): string | null {
  if (expression.type === 'MemberExpression' || expression.type === 'OptionalMemberExpression') {
    return expression.property
  }

  if (
    (expression.type === 'IndexExpression' || expression.type === 'OptionalIndexExpression') &&
    expression.index.type === 'StringLiteral'
  ) {
    return expression.index.value
  }

  return null
}

function registerObjectAlias(
  context: CFunctionContext,
  name: string,
  expression: StatementNode | null | undefined
): void {
  if (expression === null || typeof expression === 'undefined') {
    context.objectAliases.delete(name)
    return
  }

  const alias = objectExpressionPathName(expression, context)

  if (alias !== null && typeof alias !== 'undefined' && alias !== name) {
    context.objectAliases.set(name, alias)
  } else {
    context.objectAliases.delete(name)
  }
}

function resolveRuntimeObjectShape(
  declaration: StatementNode,
  expression: StatementNode | null | undefined,
  context: CFunctionContext
): CObjectShape | null {
  if (declaration.shape !== null && typeof declaration.shape !== 'undefined') {
    return declaration.shape
  }

  if (
    expression !== null &&
    typeof expression !== 'undefined' &&
    expression.shape !== null &&
    typeof expression.shape !== 'undefined'
  ) {
    return expression.shape
  }

  if (expression !== null && typeof expression !== 'undefined' && expression.type === 'ObjectLiteral') {
    const fields = resolveRuntimeObjectLiteralShapeFields(expression, context)

    if (fields.length > 0) {
      return {
        fields
      }
    }
  }

  return null
}

function resolveRuntimeObjectLiteralShapeFields(
  expression: StatementNode,
  context: CFunctionContext
): CObjectShapeField[] {
  const fields: CObjectShapeField[] = []
  const properties: StatementNode[] = expression.properties

  for (const property of properties) {
    if (property.spread === true) {
      continue
    }

    if (property.value === null || typeof property.value === 'undefined') {
      continue
    }

    fields.push(resolveRuntimeObjectLiteralShapeField(property, context))
  }

  return fields
}

function resolveRuntimeObjectLiteralShapeField(property: StatementNode, context: CFunctionContext): CObjectShapeField {
  const value: StatementNode = property.value
  let shape = value.shape

  if (shape === null || typeof shape === 'undefined') {
    shape = resolveRuntimeObjectShape(value, value, context)
  }

  return {
    name: property.key,
    readonlyField: false,
    declaredType: runtimeObjectLiteralFieldDeclaredType(value, context),
    typeRef: value.typeRef ?? null,
    valueType: runtimeObjectLiteralFieldValueType(value, context),
    shape,
    functionType: value.functionType
  }
}

function runtimeObjectLiteralFieldDeclaredType(
  value: StatementNode,
  context: CFunctionContext
): string | null | undefined {
  return cIterableElementDeclaredName(value.typeRef, context.libraries) ?? value.declaredType
}

function runtimeObjectLiteralFieldValueType(value: StatementNode, context: CFunctionContext): string {
  if (value.type === 'NumberLiteral') {
    return 'number'
  }

  if (value.type === 'BooleanLiteral') {
    return 'boolean'
  }

  if (value.type === 'StringLiteral' || value.type === 'TemplateLiteral') {
    return 'string'
  }

  if (value.type === 'NullLiteral') {
    return 'null'
  }

  const knownValueType = value.valueType

  if (knownValueType !== null && typeof knownValueType !== 'undefined') {
    if (knownValueType.length === 0) {
      return statementDeps(context).inferExpressionType(value, context)
    }

    if (knownValueType !== 'unknown') {
      return knownValueType
    }
  }

  return statementDeps(context).inferExpressionType(value, context)
}

export function isRuntimeValueLocalExpression(expression: StatementNode, context: CFunctionContext): boolean {
  const valueType = statementDeps(context).inferExpressionType(expression, context)

  return isRuntimeValueDeclarationValueType(valueType)
}

export function emitBoxedScalarVariableDeclaration(statement: StatementNode, context: CFunctionContext): string[] {
  const deps = statementDeps(context)
  const value = deps.emitPreparedNumberExpression(statement.init, context)
  const inferred = deps.inferExpressionType(statement.init, context)

  registerBoxedValue(context, statement.name, inferred)
  context.boxedVariables.add(statement.name)

  const lines: string[] = []
  pushAllLines(lines, value.lines)
  lines.push(`${emitCIdentifier(statement.name)} = (double*)inox_default_alloc(0, sizeof(double), _Alignof(double));`)
  lines.push(`if (${emitCIdentifier(statement.name)} == 0) ${deps.emitFailureStatement(context)}`)
  lines.push(`*${emitCIdentifier(statement.name)} = ${value.expression};`)

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
  let tag = 'INOX_TAG_OBJECT'

  if (valueType === 'string') {
    tag = 'INOX_TAG_STRING'
  }

  registerBoxedValue(context, statement.name, valueType)
  context.boxedVariables.add(statement.name)
  context.variables.set(statement.name, valueType)

  const lines: string[] = []
  pushAllLines(lines, value.lines)
  lines.push(
    `${emitCIdentifier(statement.name)} = (inox_value*)inox_default_alloc(0, sizeof(inox_value), _Alignof(inox_value));`
  )
  lines.push(`if (${emitCIdentifier(statement.name)} == 0) ${deps.emitFailureStatement(context)}`)
  lines.push(`*${emitCIdentifier(statement.name)} = ${value.expression};`)
  lines.push(
    emitRuntimeTypeCheck(
      `(*${emitCIdentifier(statement.name)}).tag != ${tag} || (*${emitCIdentifier(statement.name)}).as.ref == 0`,
      context
    )
  )
  lines.push(`inox_retain(*${emitCIdentifier(statement.name)});`)

  return lines
}

function isCForOfValueType(valueType: string): boolean {
  return (
    valueType === 'unknown' ||
    valueType === 'number' ||
    valueType === 'boolean' ||
    isManagedRuntimeReturnType(valueType)
  )
}

function registerForOfElementMetadata(
  context: CFunctionContext,
  name: string,
  elementType: string,
  statement: StatementNode
): void {
  context.variables.set(name, elementType)

  if (elementType === 'string') {
    context.runtimeStrings.add(name)
  } else if (elementType === 'unknown') {
    context.localValueNames.add(name)
  } else if (elementType === 'object') {
    registerObjectShape(context, name, statement.shape)
    registerForOfObjectElementDeclaredType(context, name, statement)
  }

  const nativeCppType = libraryNativeBoundaryCppType(elementType, statement.nullable === true, false, statement.shape)

  if (nativeCppType !== null) {
    context.cppValueTypes.set(name, nativeCppType)
  }
}

function registerForOfObjectElementDeclaredType(
  context: CFunctionContext,
  name: string,
  statement: StatementNode
): void {
  const declaredType =
    statement.inferredDeclaredType ??
    statement.declaredType ??
    cTypeRefDeclaredName(statement.typeRef, context.libraries)

  if (declaredType !== null && typeof declaredType !== 'undefined') {
    context.objectDeclaredTypes.set(name, declaredType)
  } else {
    context.objectDeclaredTypes.delete(name)
  }
}

function emitForOfElementDeclaration(
  statement: StatementNode,
  value: string,
  elementType: string,
  context: CFunctionContext
): PreparedExpression {
  const name = statement.name
  let declaration = `double ${name} = ${value}.as.number;`
  const checks: string[] = []
  const nativeCppType = libraryNativeBoundaryCppType(elementType, statement.nullable === true, false, statement.shape)
  const nativeValidExpression = compilerLibraryNativeRuntimeValueValidExpressionForTypeRef(
    context.libraries,
    statement.typeRef
  )

  if (nativeCppType !== null) {
    declaration = `${nativeCppType} ${name} = ${applyLibraryNativeValueAdapter(
      value,
      libraryNativeValueAdapter(statement.shape)
    )};`

    if (nativeValidExpression !== null) {
      const valid = nativeValidExpression.split('$value').join(value)
      checks.push(emitRuntimeTypeCheck(`!(${valid})`, context))
    } else {
      pushAllLines(checks, emitRuntimeValueCheckLines(value, cRuntimeValueTag(elementType), context))
    }
  } else if (elementType === 'string') {
    declaration = `inox_string* ${name} = (inox_string*)${value}.as.ref;`
    checks.push(emitRuntimeTypeCheck(`${value}.tag != INOX_TAG_STRING || ${value}.as.ref == 0`, context))
  } else if (elementType === 'unknown') {
    declaration = `inox_value ${name} = ${value};`
  } else if (elementType === 'boolean') {
    declaration = `double ${name} = static_cast<double>(${value}.as.boolean ? 1 : 0);`
    checks.push(emitRuntimeTypeCheck(`${value}.tag != INOX_TAG_BOOL`, context))
  } else if (isManagedRuntimeReturnType(elementType)) {
    const expectedTag = cRuntimeValueTag(elementType)

    declaration = `inox_value ${name} = ${value};`
    pushAllLines(checks, emitRuntimeValueCheckLines(value, expectedTag, context))
  } else {
    checks.push(emitRuntimeTypeCheck(`${value}.tag != INOX_TAG_NUMBER`, context))
  }

  return {
    lines: checks,
    expression: declaration
  }
}

function emitPreparedForInitializer(
  init: StatementNode | null | undefined,
  context: CFunctionContext
): PreparedExpression {
  if (init === null || typeof init === 'undefined') {
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
  const asyncResultConstructor = deps.emitPreparedAsyncResultConstructorExpression(
    statement.init,
    context,
    preparedCallOut(statement.name)
  )

  if (asyncResultConstructor !== null && typeof asyncResultConstructor !== 'undefined') {
    registerAsyncResultVariableMetadata(statement, asyncResultConstructor, context)
    return {
      lines: asyncResultConstructor.lines,
      expression: ''
    }
  }

  const asyncResult = deps.emitPreparedAsyncResultStaticExpression(
    statement.init,
    context,
    preparedCallOut(statement.name)
  )

  if (asyncResult !== null && typeof asyncResult !== 'undefined') {
    registerAsyncResultVariableMetadata(statement, asyncResult, context)
    return {
      lines: asyncResult.lines,
      expression: ''
    }
  }

  const asyncResultCall = deps.emitPreparedAsyncResultReturningCallExpression(
    statement.init,
    context,
    preparedCallOut(statement.name)
  )

  if (asyncResultCall !== null && typeof asyncResultCall !== 'undefined') {
    registerAsyncResultVariableMetadata(statement, asyncResultCall, context)
    return {
      lines: asyncResultCall.lines,
      expression: ''
    }
  }

  if (statement.init.valueType === 'async-result') {
    const classMethodCall = deps.emitPreparedClassMethodCallExpression(
      statement.init,
      context,
      preparedCallOut(statement.name)
    )

    if (classMethodCall !== null && typeof classMethodCall !== 'undefined') {
      registerAsyncResultVariableMetadata(statement, classMethodCall, context)
      return {
        lines: classMethodCall.lines,
        expression: ''
      }
    }
  }

  const statementValueType = statement.valueType
  const optionalChain =
    statement.init.type === 'OptionalMemberExpression' ||
    statement.init.type === 'OptionalIndexExpression' ||
    statement.init.type === 'OptionalCallExpression'
  let nullableValueType = 'unknown'

  if (
    statementValueType !== null &&
    typeof statementValueType !== 'undefined' &&
    isRuntimeNullableType(statementValueType)
  ) {
    nullableValueType = statementValueType
  } else if (optionalChain) {
    nullableValueType = deps.inferExpressionType(statement.init, context)
  }

  if (
    (statement.nullable === true || statement.init.nullable === true || optionalChain) &&
    isRuntimeNullableType(nullableValueType)
  ) {
    const lines = emitNullableRuntimeValueVariableDeclaration(statement, context)
    registerRuntimeValueMetadata(statement.name, nullableValueType, statement, statement.init, context)

    return {
      lines,
      expression: ''
    }
  }

  if (deps.isClassConstructorExpression(statement.init, context)) {
    return {
      lines: deps.emitClassObjectVariableDeclaration(statement, context),
      expression: ''
    }
  }

  if (statement.init !== null && typeof statement.init !== 'undefined' && statement.init.type === 'ObjectLiteral') {
    return {
      lines: deps.emitObjectVariableDeclaration(statement, context, deps.objectVariableDeclarationDependencies),
      expression: ''
    }
  }

  if (statement.init !== null && typeof statement.init !== 'undefined' && statement.init.type === 'ArrayLiteral') {
    return {
      lines: deps.emitArrayVariableDeclaration(statement, context),
      expression: ''
    }
  }

  if (deps.isMemberAccessExpression(statement.init)) {
    const member = deps.resolveKnownObjectMember(statement.init, context)

    if (member !== null && typeof member !== 'undefined') {
      return {
        lines: deps.emitKnownObjectMemberVariableDeclaration(
          statement,
          objectMemberWithExpressionMetadata(statement.init, member),
          context
        ),
        expression: ''
      }
    }
  }

  if (deps.isIndexAccessExpression(statement.init)) {
    const field = deps.resolveKnownObjectIndex(statement.init, context)

    if (field !== null && typeof field !== 'undefined') {
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
  const variableType =
    statement.valueType === 'function' || statement.init.type === 'ArrowFunctionExpression' ? 'function' : inferred

  context.variables.set(statement.name, variableType)

  if (variableType === 'function') {
    let runtimeFunctionType: CFunctionType | null = null
    const functionType = scalarDeclarationFunctionType(statement)
    const callbackWrapper = context.callbackArrowWrappers.get(statement.init)

    if (functionType !== null && typeof functionType !== 'undefined') {
      statement.functionType = functionType

      if (statement.init !== null && typeof statement.init !== 'undefined') {
        statement.init.functionType = functionType
      }
    }

    if (callbackWrapper !== null && typeof callbackWrapper !== 'undefined' && callbackWrapper.kind === 'arrow') {
      runtimeFunctionType = normalizeFunctionType(functionType)
    }

    context.variables.set(statement.name, 'function')
    if (runtimeFunctionType !== null && typeof runtimeFunctionType !== 'undefined') {
      context.functionTypes.set(statement.name, runtimeFunctionType)
    } else {
      context.functionTypes.set(statement.name, normalizeFunctionType(functionType))
    }

    if (
      isRuntimeFunctionType(functionType) ||
      (runtimeFunctionType !== null && typeof runtimeFunctionType !== 'undefined')
    ) {
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
        functionType,
        statement.loc
      )
    }
  }

  if (inferred === 'string') {
    if (context.boxedMutableCaptureDeclarations.has(statement)) {
      return {
        lines: emitBoxedRuntimeValueVariableDeclaration(statement, statement.init, context),
        expression: ''
      }
    }

    const runtimeString = deps.resolveRuntimeStringReference(statement.init, context)

    if (runtimeString !== null && typeof runtimeString !== 'undefined') {
      context.runtimeStrings.add(statement.name)

      return {
        lines: [],
        expression: `inox_string* ${emitCIdentifier(statement.name)} = ${runtimeString}`
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
      expression: `char* ${emitCIdentifier(statement.name)} = ${deps.emitStringExpression(statement.init, context)}`
    }
  }

  if (!isNullableScalarType(inferred)) {
    pushDiagnostic(
      context,
      diagnostic(
        cUnsupportedVariableDeclarationCode(statement, inferred),
        'this expression is not supported by the current C++ backend slice',
        statement.loc
      )
    )

    return {
      lines: [],
      expression: `double ${emitCIdentifier(statement.name)} = 0`
    }
  }

  const value = deps.emitPreparedNumberExpression(statement.init, context)

  return {
    lines: value.lines,
    expression: `double ${emitCIdentifier(statement.name)} = ${value.expression}`
  }
}

function registerAsyncResultVariableMetadata(
  statement: StatementNode,
  prepared: PreparedExpression,
  context: CFunctionContext
): void {
  if (
    statement.valueType !== 'async-result' &&
    (statement.init === null || typeof statement.init === 'undefined' || statement.init.valueType !== 'async-result')
  ) {
    return
  }

  context.variables.set(statement.name, 'async-result')

  if (prepared.valueType !== null && typeof prepared.valueType !== 'undefined' && prepared.valueType !== 'unknown') {
    context.asyncResultValueTypes.set(statement.name, prepared.valueType)
  } else if (
    statement.asyncResultValueType !== null &&
    typeof statement.asyncResultValueType !== 'undefined' &&
    statement.asyncResultValueType !== 'unknown'
  ) {
    context.asyncResultValueTypes.set(statement.name, statement.asyncResultValueType)
  } else if (
    statement.init !== null &&
    typeof statement.init !== 'undefined' &&
    statement.init.asyncResultValueType !== null &&
    typeof statement.init.asyncResultValueType !== 'undefined' &&
    statement.init.asyncResultValueType !== 'unknown'
  ) {
    context.asyncResultValueTypes.set(statement.name, statement.init.asyncResultValueType)
  }

  if (
    prepared.rejectionValueType !== null &&
    typeof prepared.rejectionValueType !== 'undefined' &&
    prepared.rejectionValueType !== '' &&
    prepared.rejectionValueType !== 'unknown'
  ) {
    context.asyncResultRejectionValueTypes.set(statement.name, prepared.rejectionValueType)
  }
}

function emitPreparedForExpressionClause(
  expression: StatementNode | null | undefined,
  context: CFunctionContext
): PreparedExpression {
  if (expression === null || typeof expression === 'undefined') {
    return {
      lines: [],
      expression: ''
    }
  }

  return emitPreparedConditionExpression(expression, context)
}

function emitPreparedConditionExpression(expression: StatementNode, context: CFunctionContext): PreparedExpression {
  const truthiness = statementDeps(context).emitPreparedRuntimeTruthinessExpression(expression, context)

  if (truthiness !== null && typeof truthiness !== 'undefined') {
    return truthiness
  }

  return statementDeps(context).emitPreparedNumberExpression(expression, context)
}

export function emitForOfStatement(statement: StatementNode, context: CFunctionContext): string[] {
  const libraryIterable = emitCompilerLibraryForOfStatement(statement, context)

  if (libraryIterable !== null) {
    return libraryIterable
  }

  pushDiagnostic(
    context,
    diagnostic('INOX_C_FOR_OF', 'C for-of requires iteration metadata from a compiler library', statement.loc)
  )
  return []
}

function emitCompilerLibraryForOfStatement(statement: StatementNode, context: CFunctionContext): string[] | null {
  const iteration = resolveCompilerLibraryIteration(statement, context)

  if (iteration === null) {
    return null
  }

  const elementType = stringOrUnknown(statement.valueType)

  if (!isCForOfValueType(elementType)) {
    pushDiagnostic(
      context,
      diagnostic(
        'INOX_C_FOR_OF',
        'C library iteration supports only number/boolean/string or managed runtime values',
        statement.loc
      )
    )
    return []
  }

  const iterable = statementDeps(context).emitCValueExpression(statement.iterable, context)
  let receiver = iterable.expression

  if (
    iterable.cppType === null ||
    typeof iterable.cppType === 'undefined' ||
    iterable.cppType === 'inox::Value' ||
    iterable.cppType === 'inox_value'
  ) {
    receiver = applyCompilerLibraryIterationAdapter(receiver, iteration.receiverAdapter)
  }

  const iterator = nextCName(context, 'inox_library_iterator')
  const step = nextCName(context, 'inox_library_step')
  const value = nextCName(context, 'inox_library_value')
  const breakTarget: CLoopFlowTarget = { label: nextCName(context, 'inox_break'), throughFinally: false }
  const continueTarget: CLoopFlowTarget = { label: nextCName(context, 'inox_continue'), throughFinally: false }
  const variableScope = pushVariableScope(context)

  try {
    registerForOfElementMetadata(context, statement.name, elementType, statement)
    pushFlowTarget(context.breakTargets, breakTarget)
    pushFlowTarget(context.continueTargets, continueTarget)
    const body = emitScopedStatementBody(statement.body, context, [], [])
    popFlowTarget(context.continueTargets)
    popFlowTarget(context.breakTargets)
    const element = emitForOfElementDeclaration(statement, value, elementType, context)
    const lines: string[] = []

    pushAllLines(lines, iterable.lines)
    if (iteration.iteratorMethod === null) {
      lines.push(`auto ${iterator} = ${receiver};`)
    } else {
      lines.push(`auto ${iterator} = (${receiver}).${iteration.iteratorMethod}();`)
    }

    if (iteration.failureMode === 'thrown') {
      lines.push(emitRuntimeTypeCheck('inox::thrown()', context))
    }

    lines.push('while (true) {')
    const loopBody = [`auto ${step} = ${iterator}.${iteration.nextMethod}();`]

    if (iteration.failureMode === 'thrown') {
      loopBody.push(emitRuntimeTypeCheck('inox::thrown()', context))
    }

    loopBody.push(`if (${step}.${iteration.doneMember}) break;`)
    const memberValue = `${step}.${iteration.valueMember}`
    const adaptedValue = applyCompilerLibraryIterationAdapter(memberValue, iteration.valueAdapter)
    loopBody.push(`auto ${value} = ${adaptedValue};`)
    pushAllLines(loopBody, element.lines)
    loopBody.push(element.expression)
    pushAllLines(loopBody, body)
    const hasContinueLabel = shouldEmitFlowTargetLabel(continueTarget)
    pushLoopBodyLines(lines, loopBody, '  ', hasContinueLabel)

    if (hasContinueLabel) {
      pushAllLines(lines, emitContinueTargetLabel(continueTarget.label, context))
    }

    lines.push('}')

    if (shouldEmitFlowTargetLabel(breakTarget)) {
      pushAllLines(lines, emitBreakTargetLabel(breakTarget.label, context))
    }

    return lines
  } finally {
    restoreVariableScope(context, variableScope)
  }
}

function resolveCompilerLibraryIteration(
  statement: StatementNode,
  context: CFunctionContext
): CCompilerLibraryIteration | null {
  const iteratorMethod = stringOrNull(statement.libraryCIteratorMethod)
  const nextMethod = stringOrNull(statement.libraryCIteratorNextMethod)
  const doneMember = stringOrNull(statement.libraryCIteratorDoneMember)
  const valueMember = stringOrNull(statement.libraryCIteratorValueMember)

  if (iteratorMethod !== null && nextMethod !== null && doneMember !== null && valueMember !== null) {
    return {
      doneMember,
      failureMode: statement.libraryCIteratorFailureMode === 'thrown' ? 'thrown' : null,
      iteratorMethod,
      nextMethod,
      receiverAdapter: stringOrNull(statement.libraryCIteratorReceiverAdapter),
      valueAdapter: stringOrNull(statement.libraryCIteratorValueAdapter),
      valueMember
    }
  }

  const typeId = compilerLibraryIterableTypeId(statement.iterable)

  if (typeId === null) {
    return null
  }

  const iteration = compilerLibraryNativeIterationForId(context.libraries, typeId)

  if (iteration === null || typeof iteration === 'undefined') {
    return null
  }

  return {
    doneMember: iteration.doneMember,
    failureMode: iteration.failureMode === 'thrown' ? 'thrown' : null,
    iteratorMethod: iteration.iteratorMethod,
    nextMethod: iteration.nextMethod,
    receiverAdapter: iteration.receiverAdapter ?? null,
    valueAdapter: iteration.valueAdapter ?? null,
    valueMember: iteration.valueMember
  }
}

function compilerLibraryIterableTypeId(iterable: StatementNode): string | null {
  const typeRef = iterable.typeRef

  if (
    typeRef !== null &&
    typeof typeRef !== 'undefined' &&
    typeRef.kind === 'nominal' &&
    typeof typeRef.typeId === 'string'
  ) {
    return typeRef.typeId
  }

  const shape = iterable.shape

  if (shape !== null && typeof shape !== 'undefined' && typeof shape.libraryTypeId === 'string') {
    return shape.libraryTypeId
  }

  return null
}

function applyCompilerLibraryIterationAdapter(value: string, adapter: string | null | undefined): string {
  if (adapter === null || typeof adapter === 'undefined' || adapter.length === 0) {
    return value
  }

  return adapter.split('$value').join(value)
}

export function emitSwitchStatement(statement: StatementNode, context: CFunctionContext): string[] {
  const discriminant = statementDeps(context).emitPreparedNumberExpression(statement.discriminant, context)
  const breakTarget: CLoopFlowTarget = { label: nextCName(context, 'inox_break'), throughFinally: false }
  const lines: string[] = []
  pushAllLines(lines, discriminant.lines)
  lines.push(`switch (static_cast<int>(${discriminant.expression})) {`)

  for (const item of statement.cases) {
    const test = statementChild(item.test)
    const consequent = statementNodeArray(item.consequent)

    if (test === null) {
      lines.push('  default: {')
    } else {
      lines.push(`  case ${emitSwitchCaseLabel(test, context)}: {`)
    }

    pushFlowTarget(context.breakTargets, breakTarget)
    const body = emitScopedStatementList(consequent, context)
    popFlowTarget(context.breakTargets)
    pushIndentedLines(lines, body, '    ')
    lines.push('  }')
  }

  lines.push('}')
  if (shouldEmitFlowTargetLabel(breakTarget)) {
    pushAllLines(lines, emitBreakTargetLabel(breakTarget.label, context))
  }

  return lines
}

function emitSwitchCaseLabel(expression: StatementNode | null | undefined, context: CFunctionContext): string {
  if (expression !== null && typeof expression !== 'undefined' && expression.type === 'NumberLiteral') {
    return `static_cast<int>(${expression.value})`
  }

  if (expression !== null && typeof expression !== 'undefined' && expression.type === 'BooleanLiteral') {
    if (expression.value) {
      return 'static_cast<int>(1)'
    }

    return 'static_cast<int>(0)'
  }

  if (expression !== null && typeof expression !== 'undefined' && expression.type === 'UnaryExpression') {
    const argument = expression.argument

    if (argument.type === 'NumberLiteral' && isSwitchCaseUnaryOperator(expression.operator)) {
      return `static_cast<int>(${expression.operator}${argument.value})`
    }
  }

  pushDiagnostic(
    context,
    diagnostic(
      'INOX_C_SWITCH_CASE',
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
    statement.handler !== null &&
    typeof statement.handler !== 'undefined' &&
    currentErrorTarget(context) &&
    containsAwaitExpression(statement.block)
  ) {
    pushDiagnostic(
      context,
      diagnostic(
        'INOX_C_ASYNC',
        'nested async try/catch state-machine lowering is not supported by the current C++ backend slice',
        statement.loc
      )
    )
  }

  const id = context.nextId
  context.nextId = context.nextId + 1
  let catchLabel: string | null = null
  let finallyLabel: string | null = null

  if (statement.handler !== null && typeof statement.handler !== 'undefined') {
    catchLabel = `catch_${id}`
  }

  if (statement.finalizer !== null && typeof statement.finalizer !== 'undefined') {
    finallyLabel = `finally_${id}`
  }

  const endLabel = `end_${id}`
  let throwTarget = catchLabel

  if (throwTarget === null || typeof throwTarget === 'undefined') {
    throwTarget = finallyLabel
  }

  if (finallyLabel !== null && typeof finallyLabel !== 'undefined') {
    registerErrorChannel(context)
  }

  const outerReturnTarget = currentReturnTarget(context)
  const outerBreakTarget = currentBreakTarget(context)
  const outerContinueTarget = currentContinueTarget(context)
  const lines = ['{']

  if (throwTarget !== null && typeof throwTarget !== 'undefined') {
    pushErrorTarget(context, throwTarget, catchLabel === null && finallyLabel !== null)
  }

  if (finallyLabel !== null && typeof finallyLabel !== 'undefined') {
    pushStringTarget(context.returnTargets, finallyLabel)
    pushFlowTarget(context.breakTargets, { label: finallyLabel, throughFinally: true })
    pushFlowTarget(context.continueTargets, { label: finallyLabel, throughFinally: true })
  }

  const tryBody = emitScopedStatementBody(statement.block, context, [], [])

  if (finallyLabel !== null && typeof finallyLabel !== 'undefined') {
    popFlowTarget(context.continueTargets)
    popFlowTarget(context.breakTargets)
    popStringTarget(context.returnTargets)
  }

  if (throwTarget !== null && typeof throwTarget !== 'undefined') {
    popErrorTarget(context)
  }

  lines.push(`  { // try_${id}`)
  pushIndentedLines(lines, tryBody, '    ')
  if (finallyLabel !== null && typeof finallyLabel !== 'undefined') {
    lines.push(`    goto ${finallyLabel};`)
  } else {
    lines.push(`    goto ${endLabel};`)
  }
  if (catchLabel === null || typeof catchLabel === 'undefined') {
    lines.push('  }')
  }

  if (
    statement.handler !== null &&
    typeof statement.handler !== 'undefined' &&
    catchLabel !== null &&
    typeof catchLabel !== 'undefined'
  ) {
    let catchValueType = 'unknown'

    if (statement.handler.param !== null && typeof statement.handler.param !== 'undefined') {
      catchValueType = statementDeps(context).inferCatchBindingValueType(statement, context)
    }
    if (finallyLabel !== null && typeof finallyLabel !== 'undefined') {
      pushStringTarget(context.returnTargets, finallyLabel)
      pushFlowTarget(context.breakTargets, { label: finallyLabel, throughFinally: true })
      pushFlowTarget(context.continueTargets, { label: finallyLabel, throughFinally: true })
    }

    const variableScope = pushVariableScope(context)
    const catchBody: string[] = []
    let catchExceptionName = 'inox_error'
    let catchNeedsStringBinding = false

    try {
      if (statement.handler.param !== null && typeof statement.handler.param !== 'undefined') {
        context.localValueNames.add(statement.handler.param)
        const catchParamName = emitCIdentifier(statement.handler.param)

        if (catchValueType === 'object') {
          context.variables.set(statement.handler.param, 'object')
          statementDeps(context).registerExceptionValueShape(context, statement.handler.param)
          catchExceptionName = catchParamName
        } else if (catchValueType === 'string') {
          context.variables.set(statement.handler.param, 'string')
          context.runtimeStrings.add(statement.handler.param)
          catchNeedsStringBinding = true
          catchBody.push(`inox_string* ${catchParamName} = (inox_string*)inox_error.as.ref;`)
        } else {
          context.variables.set(statement.handler.param, 'unknown')
          context.exceptionValueNames.add(statement.handler.param)
          catchExceptionName = catchParamName
        }
      }

      pushAllLines(catchBody, emitStatementBody(statement.handler.body, context))
    } finally {
      restoreVariableScope(context, variableScope)
    }

    if (finallyLabel !== null && typeof finallyLabel !== 'undefined') {
      popFlowTarget(context.continueTargets)
      popFlowTarget(context.breakTargets)
      popStringTarget(context.returnTargets)
    }

    lines.push('  }')
    lines.push(`  ${catchLabel}: {`)
    if (statement.handler.param === null || typeof statement.handler.param === 'undefined') {
      lines.push('    inox::take_exception();')
    } else if (catchNeedsStringBinding) {
      lines.push('    auto inox_error = inox::take_exception();')
    } else {
      lines.push(`    auto ${catchExceptionName} = inox::take_exception();`)
    }
    if (finallyLabel !== null && typeof finallyLabel !== 'undefined') {
      lines.push('    inox_error_active = 0;')
    }
    pushIndentedLines(lines, catchBody, '    ')
    lines.push('}')
  }

  if (
    statement.finalizer !== null &&
    typeof statement.finalizer !== 'undefined' &&
    finallyLabel !== null &&
    typeof finallyLabel !== 'undefined'
  ) {
    const outerThrowTarget = currentErrorTarget(context)
    const outerThrowTargetNeedsActive = currentErrorTargetRequiresActive(context)
    let outerBreakLabel: string | null = null
    let outerBreakThroughFinally = false
    let outerContinueLabel: string | null = null
    let outerContinueThroughFinally = false

    if (outerBreakTarget !== null && typeof outerBreakTarget !== 'undefined') {
      outerBreakLabel = outerBreakTarget.label
      outerBreakThroughFinally = outerBreakTarget.throughFinally === true
    }

    if (outerContinueTarget !== null && typeof outerContinueTarget !== 'undefined') {
      outerContinueLabel = outerContinueTarget.label
      outerContinueThroughFinally = outerContinueTarget.throughFinally === true
    }

    if (outerThrowTarget !== null && typeof outerThrowTarget !== 'undefined') {
      pushErrorTarget(context, outerThrowTarget, outerThrowTargetNeedsActive)
    }

    if (outerReturnTarget !== null && typeof outerReturnTarget !== 'undefined') {
      pushStringTarget(context.returnTargets, outerReturnTarget)
    }

    if (outerBreakLabel !== null && typeof outerBreakLabel !== 'undefined') {
      pushFlowTarget(context.breakTargets, {
        label: outerBreakLabel,
        throughFinally: outerBreakThroughFinally
      })
    }

    if (outerContinueLabel !== null && typeof outerContinueLabel !== 'undefined') {
      pushFlowTarget(context.continueTargets, {
        label: outerContinueLabel,
        throughFinally: outerContinueThroughFinally
      })
    }

    const finalizerBody = emitScopedStatementBody(statement.finalizer, context, [], [])

    if (outerContinueLabel !== null && typeof outerContinueLabel !== 'undefined') {
      popFlowTarget(context.continueTargets)
    }

    if (outerBreakLabel !== null && typeof outerBreakLabel !== 'undefined') {
      popFlowTarget(context.breakTargets)
    }

    if (outerReturnTarget !== null && typeof outerReturnTarget !== 'undefined') {
      popStringTarget(context.returnTargets)
    }

    if (outerThrowTarget !== null && typeof outerThrowTarget !== 'undefined') {
      popErrorTarget(context)
    }

    lines.push(`${finallyLabel}:`)
    lines.push('  {')
    pushIndentedLines(lines, finalizerBody, '    ')
    lines.push('  }')

    if (outerThrowTarget !== null && typeof outerThrowTarget !== 'undefined') {
      lines.push(`  if (inox_error_active) goto ${outerThrowTarget};`)
    } else {
      const finalizerFailureStatement: string = statementDeps(context).emitFailureStatement(context)
      lines.push(`  if (inox_error_active) ${finalizerFailureStatement}`)
    }

    if (context.returnFlowUsed) {
      if (outerReturnTarget !== null && typeof outerReturnTarget !== 'undefined') {
        lines.push(`  if (inox_return_active) goto ${outerReturnTarget};`)
      } else {
        lines.push(`  if (inox_return_active) ${emitReturnCleanupStatement(context)}`)
      }
    }

    if (context.breakFlowUsed && outerBreakTarget !== null && typeof outerBreakTarget !== 'undefined') {
      outerBreakTarget.used = true
      lines.push(`  if (inox_break_active) goto ${outerBreakTarget.label};`)
    }

    if (context.continueFlowUsed && outerContinueTarget !== null && typeof outerContinueTarget !== 'undefined') {
      outerContinueTarget.used = true
      lines.push(`  if (inox_continue_active) goto ${outerContinueTarget.label};`)
    }
  }

  pushEndLabel(lines, endLabel)
  lines.push('}')

  return stripOuterGeneratedScope(lines)
}

function pushEndLabel(lines: string[], endLabel: string): void {
  lines.push(`${endLabel}:;`)
}

export function emitThrowStatement(statement: StatementNode, context: CFunctionContext): string[] {
  const target = currentErrorTarget(context)

  if ((target === null || typeof target === 'undefined') && !context.throwingFunction) {
    pushDiagnostic(
      context,
      diagnostic('INOX_C_THROW', 'uncaught throw is not supported by the current C++ backend slice', statement.loc)
    )
    return []
  }

  const isExceptionValue = isThrowableExceptionValueExpression(statement.argument, context)
  const valueType = throwableExpressionValueType(statement.argument, context, isExceptionValue)

  if (valueType !== 'string' && !isExceptionValue) {
    pushDiagnostic(
      context,
      diagnostic(
        'INOX_C_THROW',
        'C throw currently supports only string values and package-provided exception objects in local try/catch regions',
        statement.loc
      )
    )
    return []
  }

  const value = emitThrowableObjectValueExpression(
    statementDeps(context).emitCValueExpression(statement.argument, context),
    context
  )

  if (target !== null && typeof target !== 'undefined') {
    const errorActiveNeeded = currentErrorTargetRequiresActive(context)
    const errorValue = nextCName(context, 'inox_throw_error')
    const lines: string[] = []

    if (errorActiveNeeded) {
      registerErrorChannel(context)
    }

    registerOwnedValue(context, errorValue)
    pushAllLines(lines, value.lines)
    pushAllLines(lines, emitPrepareOwnedValueWrite(errorValue))
    lines.push(`${errorValue} = ${value.expression};`)

    const typeCheck = throwableValueMismatchCondition(errorValue, valueType, isExceptionValue)

    lines.push(emitRuntimeTypeCheck(typeCheck, context))
    pushPreparedRuntimeValueOwnershipLines(lines, errorValue, value)
    lines.push(`inox::throw_value(${errorValue});`)

    if (errorActiveNeeded) {
      lines.push('inox_error_active = 1;')
    }

    lines.push(`goto ${target};`)

    return lines
  }

  const errorActiveNeeded = context.throwingFunction

  if (errorActiveNeeded) {
    registerErrorChannel(context)
  } else {
    registerErrorValue(context)
  }

  const lines: string[] = []
  pushAllLines(lines, value.lines)
  pushAllLines(lines, emitPrepareOwnedValueWrite('inox_error'))
  lines.push(`inox_error = ${value.expression};`)

  const typeCheck = throwableValueMismatchCondition('inox_error', valueType, isExceptionValue)

  lines.push(emitRuntimeTypeCheck(typeCheck, context))
  pushPreparedRuntimeValueOwnershipLines(lines, 'inox_error', value)

  if (target === null || typeof target === 'undefined') {
    lines.push('inox_status_result = INOX_ERR_THROW;')
  }

  if (errorActiveNeeded) {
    lines.push('inox_error_active = 1;')
  }

  if (target !== null && typeof target !== 'undefined') {
    lines.push(`goto ${target};`)
  } else {
    lines.push('goto cleanup;')
  }

  return lines
}

function throwableExpressionValueType(
  expression: StatementNode,
  context: CFunctionContext,
  isExceptionValue: boolean
): string {
  const valueType = statementDeps(context).inferExpressionType(expression, context)

  if (!isExceptionValue || expression.type !== 'Reference' || expression.path.length !== 1) {
    return valueType
  }

  const contextValueType = context.variables.get(expression.path[0])

  if (contextValueType === 'unknown') {
    return 'unknown'
  }

  return valueType
}

function emitThrowableObjectValueExpression(value: PreparedExpression, context: CFunctionContext): PreparedExpression {
  const className = cClassNameFromValueType(value.valueType)

  if (className === null || typeof className === 'undefined') {
    return value
  }

  const temp = nextCName(context, 'inox_throw_value')
  const lines: string[] = []

  pushAllLines(lines, value.lines)
  registerOwnedValue(context, temp)
  pushAllLines(lines, emitPrepareOwnedValueWrite(temp))
  lines.push(
    emitStatusCheck(
      `inox_class_instance_ref_copy(&inox_default_allocator, &${emitCClassDescriptorNameForClassName(context, className)}, &${value.expression}, &${temp})`,
      context
    )
  )

  return {
    lines,
    expression: temp,
    valueType: 'object'
  }
}

function throwableValueMismatchCondition(name: string, valueType: string, isExceptionValue: boolean): string {
  if (!isExceptionValue || valueType === 'string') {
    return `${name}.tag != INOX_TAG_STRING || ${name}.as.ref == 0`
  }

  if (valueType === 'object') {
    return runtimeObjectLikeValueMismatchCondition(name)
  }

  return `(${name}.tag != INOX_TAG_STRING && ${runtimeObjectLikeTagMismatchCondition(name)}) || ${name}.as.ref == 0`
}

function isThrowableExceptionValueExpression(expression: StatementNode, context: CFunctionContext): boolean {
  const deps = statementDeps(context)

  if (deps.isExceptionValueExpression(expression, context)) {
    return true
  }

  if (deps.isClassConstructorExpression(expression, context)) {
    return true
  }

  if (expression.type === 'Reference' && expression.path.length === 1) {
    const name = expression.path[0]
    return context.classInstanceTypes.has(name)
  }

  return false
}

export function emitReturnStatement(statement: StatementNode, context: CFunctionContext): string[] {
  let argument: StatementNode | null | undefined = statement.argument
  let returnStatement: StatementNode = statement

  if (argument !== null && typeof argument !== 'undefined' && shouldNormalizeCAsyncReturnArgument(argument, context)) {
    argument = cAsyncReturnAwaitExpression(argument, context.returnType, statement.loc)
    returnStatement = returnStatementWithArgument(statement, argument)
  }

  if (isRuntimeCallbackReturnContext(context)) {
    return emitRuntimeCallbackReturnStatement(returnStatement, context)
  }

  if (context.returnType === 'async-result') {
    return emitAsyncResultReturnStatement(returnStatement, context)
  }

  if (context.returnNullable === true && isNullableScalarType(context.returnType)) {
    return emitNullableScalarReturnStatement(returnStatement, context)
  }

  if (
    libraryNativeBoundaryCppType(context.returnType, context.returnNullable === true, false, context.returnShape) !==
    null
  ) {
    return emitLibraryNativeReturnStatement(returnStatement, context)
  }

  if (isRuntimeValueReturnType(context.returnType)) {
    return emitRuntimeValueReturnStatement(returnStatement, context)
  }

  if (context.returnType !== 'void') {
    let value: PreparedExpression = {
      lines: [],
      expression: '0'
    }

    if (argument !== null && typeof argument !== 'undefined') {
      value = statementDeps(context).emitPreparedNumberExpression(argument, context)
    }

    const lines: string[] = []
    pushAllLines(lines, value.lines)
    lines.push(`inox_return = ${value.expression};`)
    pushAllLines(lines, emitReturnJump(context))

    return lines
  }

  let value: PreparedExpression | null = null

  if (argument !== null && typeof argument !== 'undefined' && argument.type === 'AwaitExpression') {
    value = statementDeps(context).emitCAwaitValueExpression(argument, context)
  }

  if (argument === null || typeof argument === 'undefined' || context.returnType === 'void') {
    if (context.cleanupEnabled) {
      const lines: string[] = []

      if (value !== null && typeof value !== 'undefined') {
        pushAllLines(lines, value.lines)
      }

      pushAllLines(lines, emitReturnJump(context))

      return lines
    }

    return ['return;']
  }

  const expression: string = statementDeps(context).emitCExpression(argument, context)
  return [`return ${expression};`]
}

function emitLibraryNativeReturnStatement(statement: StatementNode, context: CFunctionContext): string[] {
  if (statement.argument === null || typeof statement.argument === 'undefined') {
    return emitReturnJump(context)
  }

  const value = statementDeps(context).emitCValueExpression(statement.argument, context)
  const lines: string[] = []
  const returnCppType = libraryNativeBoundaryCppType(
    context.returnType,
    context.returnNullable === true,
    false,
    context.returnShape
  )
  let returnExpression = value.expression

  pushAllLines(lines, value.lines)

  if (value.cppType !== returnCppType) {
    const adapter = libraryNativeValueAdapter(context.returnShape)

    if (adapter === null) {
      pushDiagnostic(
        context,
        diagnostic(
          'INOX_C_LIBRARY_NATIVE_VALUE_ADAPTER',
          'runtime-backed native return value requires a package C++ value adapter',
          statement.argument.loc
        )
      )
    }

    returnExpression = applyLibraryNativeValueAdapter(returnExpression, adapter)
  }

  lines.push(`inox_return = ${returnExpression};`)
  pushAllLines(lines, emitReturnJump(context))
  return lines
}

export function emitVariableDeclarationStatement(statement: StatementNode, context: CFunctionContext): string[] {
  const deps = statementDeps(context)

  if (context.moduleValueDeclarationScope && context.moduleValueNames.has(statement.name)) {
    return deps.emitModuleValueVariableAssignment(statement, context)
  }

  context.localValueNames.add(statement.name)
  context.runtimeValueStorageNames.delete(statement.name)

  if (statement.init === null || typeof statement.init === 'undefined') {
    return deps.emitScalarVariableDeclaration(statement, context)
  }

  materializeSynthesizedCompilerLibraryIndexOperation(statement.init, context)

  const libraryObject = deps.emitPreparedCompilerLibraryCallExpression(
    statement.init,
    context,
    preparedCallOut(statement.name)
  )

  if (libraryObject !== null && statement.init.valueType === 'async-result') {
    registerAsyncResultVariableMetadata(statement, libraryObject, context)
    return libraryObject.lines
  }

  if (libraryObject !== null && libraryObject.valueType === 'object') {
    if (deps.isExceptionValueExpression(statement.init, context)) {
      deps.registerExceptionValueShape(context, statement.name)
    }

    context.variables.set(statement.name, 'object')
    if (libraryObject.cppType !== null && typeof libraryObject.cppType !== 'undefined') {
      context.cppValueTypes.set(statement.name, libraryObject.cppType)
    }
    registerRuntimeValueMetadata(statement.name, 'object', statement, statement.init, context)
    return libraryObject.lines
  }

  if (
    libraryObject !== null &&
    libraryObject.cppType !== null &&
    typeof libraryObject.cppType !== 'undefined' &&
    libraryObject.valueType !== null &&
    typeof libraryObject.valueType !== 'undefined' &&
    isManagedRuntimeReturnType(libraryObject.valueType)
  ) {
    const lines: string[] = []
    pushAllLines(lines, libraryObject.lines)

    if (libraryObject.cppDeclaredName === null || typeof libraryObject.cppDeclaredName === 'undefined') {
      lines.push(
        `${constPrefix(statement.kind === 'const')}auto ${emitCIdentifier(statement.name)} = ${libraryObject.expression};`
      )
    }

    context.variables.set(statement.name, libraryObject.valueType)
    context.cppValueTypes.set(statement.name, libraryObject.cppType)
    registerRuntimeValueMetadata(statement.name, libraryObject.valueType, statement, statement.init, context)
    return lines
  }

  if (
    libraryObject !== null &&
    libraryObject.cppType === 'inox::Value' &&
    (libraryObject.scalarType === null || typeof libraryObject.scalarType === 'undefined')
  ) {
    const lines: string[] = []
    let valueType = 'unknown'

    if (libraryObject.valueType !== null && typeof libraryObject.valueType !== 'undefined') {
      valueType = libraryObject.valueType
    } else if (statement.valueType !== null && typeof statement.valueType !== 'undefined') {
      valueType = statement.valueType
    } else if (statement.init.valueType !== null && typeof statement.init.valueType !== 'undefined') {
      valueType = statement.init.valueType
    }

    pushAllLines(lines, libraryObject.lines)

    if (libraryObject.cppDeclaredName === null || typeof libraryObject.cppDeclaredName === 'undefined') {
      lines.push(
        `${constPrefix(statement.kind === 'const')}auto ${emitCIdentifier(statement.name)} = ${libraryObject.expression};`
      )
    }

    context.variables.set(statement.name, valueType)
    context.cppValueTypes.set(statement.name, libraryObject.cppType)
    registerRuntimeValueMetadata(statement.name, valueType, statement, statement.init, context)
    return lines
  }

  const asyncAsyncResultCall = deps.emitPreparedAsyncFunctionAsyncResultCallExpression(
    statement.init,
    context,
    preparedCallOut(statement.name)
  )

  if (asyncAsyncResultCall !== null && typeof asyncAsyncResultCall !== 'undefined') {
    registerAsyncResultVariableMetadata(statement, asyncAsyncResultCall, context)
    return asyncAsyncResultCall.lines
  }

  const asyncResultMethod = deps.emitPreparedAsyncResultChainExpression(
    statement.init,
    context,
    preparedCallOut(statement.name)
  )

  if (asyncResultMethod !== null && typeof asyncResultMethod !== 'undefined') {
    registerAsyncResultVariableMetadata(statement, asyncResultMethod, context)
    return asyncResultMethod.lines
  }

  const asyncResultConstructor = deps.emitPreparedAsyncResultConstructorExpression(
    statement.init,
    context,
    preparedCallOut(statement.name)
  )

  if (asyncResultConstructor !== null && typeof asyncResultConstructor !== 'undefined') {
    registerAsyncResultVariableMetadata(statement, asyncResultConstructor, context)
    return asyncResultConstructor.lines
  }

  const asyncResult = deps.emitPreparedAsyncResultStaticExpression(
    statement.init,
    context,
    preparedCallOut(statement.name)
  )

  if (asyncResult !== null && typeof asyncResult !== 'undefined') {
    registerAsyncResultVariableMetadata(statement, asyncResult, context)
    return asyncResult.lines
  }

  const asyncResultCall = deps.emitPreparedAsyncResultReturningCallExpression(
    statement.init,
    context,
    preparedCallOut(statement.name)
  )

  if (asyncResultCall !== null && typeof asyncResultCall !== 'undefined') {
    registerAsyncResultVariableMetadata(statement, asyncResultCall, context)
    return asyncResultCall.lines
  }

  if (statement.init.valueType === 'async-result') {
    const classMethodCall = deps.emitPreparedClassMethodCallExpression(
      statement.init,
      context,
      preparedCallOut(statement.name)
    )

    if (classMethodCall !== null && typeof classMethodCall !== 'undefined') {
      registerAsyncResultVariableMetadata(statement, classMethodCall, context)
      return classMethodCall.lines
    }
  }

  const statementValueType = statement.valueType
  const optionalChain =
    statement.init.type === 'OptionalMemberExpression' ||
    statement.init.type === 'OptionalIndexExpression' ||
    statement.init.type === 'OptionalCallExpression'
  let nullableValueType = 'unknown'

  if (
    statementValueType !== null &&
    typeof statementValueType !== 'undefined' &&
    isRuntimeNullableType(statementValueType)
  ) {
    nullableValueType = statementValueType
  } else if (optionalChain) {
    nullableValueType = deps.inferExpressionType(statement.init, context)
  }

  if (
    (statement.nullable === true || statement.init.nullable === true || optionalChain) &&
    isRuntimeNullableType(nullableValueType)
  ) {
    const lines = emitNullableRuntimeValueVariableDeclaration(statement, context)

    registerRuntimeValueMetadata(statement.name, nullableValueType, statement, statement.init, context)

    return lines
  }

  if (deps.isClassConstructorExpression(statement.init, context)) {
    return deps.emitClassObjectVariableDeclaration(statement, context)
  }

  const nativeClassValueDeclaration = emitNativeClassExpressionVariableDeclaration(statement, context)

  if (nativeClassValueDeclaration !== null && typeof nativeClassValueDeclaration !== 'undefined') {
    return nativeClassValueDeclaration
  }

  if (statement.init !== null && typeof statement.init !== 'undefined' && statement.init.type === 'ObjectLiteral') {
    if (context.boxedMutableCaptureDeclarations.has(statement)) {
      return deps.emitBoxedObjectVariableDeclaration(statement, context)
    }

    return deps.emitObjectVariableDeclaration(statement, context, deps.objectVariableDeclarationDependencies)
  }

  if (
    statement.init !== null &&
    typeof statement.init !== 'undefined' &&
    (statement.init.type === 'ArrayLiteral' ||
      (cIterableElementValueType(statement.typeRef, context.libraries) !== null &&
        statement.init.elements !== null &&
        typeof statement.init.elements !== 'undefined'))
  ) {
    return deps.emitArrayVariableDeclaration(statement, context)
  }

  const nativeShape = variableDeclarationNativeShape(statement, context)

  if (libraryNativeBoundaryCppType(statement.valueType, statement.nullable === true, false, nativeShape) !== null) {
    return emitRuntimeValueVariableDeclaration(statement, statement.init, context, statement.valueType, nativeShape)
  }

  if (deps.isMemberAccessExpression(statement.init)) {
    const member = deps.resolveKnownObjectMember(statement.init, context)

    if (member !== null && typeof member !== 'undefined') {
      return deps.emitKnownObjectMemberVariableDeclaration(
        statement,
        objectMemberWithExpressionMetadata(statement.init, member),
        context
      )
    }
  }

  if (deps.isIndexAccessExpression(statement.init)) {
    const field = deps.resolveKnownObjectIndex(statement.init, context)

    if (field !== null && typeof field !== 'undefined') {
      return deps.emitDynamicObjectMemberVariableDeclaration(statement, field, context)
    }
  }

  if (statement.valueType === 'string' && deps.isDynamicRuntimeValueExpression(statement.init, context)) {
    return emitRuntimeStringVariableDeclaration(statement, statement.init, context)
  }

  if (statement.init.type === 'AwaitExpression') {
    const awaitValueDeclaration = deps.emitAwaitValueVariableDeclaration(statement, context)

    if (awaitValueDeclaration !== null && typeof awaitValueDeclaration !== 'undefined') {
      return awaitValueDeclaration
    }
  }

  if (statement.init.type === 'AwaitExpression' && deps.inferExpressionType(statement.init, context) === 'void') {
    return emitRuntimeValueVariableDeclaration(statement, statement.init, context, 'unknown')
  }

  if (statement.init.type === 'AwaitExpression' && deps.inferExpressionType(statement.init, context) === 'string') {
    return emitRuntimeStringVariableDeclaration(statement, statement.init, context)
  }

  if (isRuntimeValueLocalExpression(statement.init, context)) {
    return emitRuntimeValueVariableDeclaration(statement, statement.init, context)
  }

  if (isOpaqueRuntimeValueType(statement.valueType)) {
    return emitRuntimeValueVariableDeclaration(statement, statement.init, context, statement.valueType)
  }

  if (isDynamicRuntimeValueDeclaration(statement, context)) {
    let valueType: string = 'unknown'
    const statementValueType = statement.valueType

    if (statementValueType !== null && typeof statementValueType !== 'undefined') {
      valueType = statementValueType
    }

    return emitRuntimeValueVariableDeclaration(statement, statement.init, context, valueType)
  }

  if (
    statement.init !== null &&
    typeof statement.init !== 'undefined' &&
    statement.init.type === 'CallExpression' &&
    statement.nullable !== true &&
    deps.inferExpressionType(statement.init, context) === 'string'
  ) {
    return emitRuntimeStringVariableDeclaration(statement, statement.init, context)
  }

  return deps.emitScalarVariableDeclaration(statement, context)
}

function materializeSynthesizedCompilerLibraryIndexOperation(
  expression: StatementNode,
  context: CFunctionContext
): void {
  if (
    (expression.type !== 'IndexExpression' && expression.type !== 'OptionalIndexExpression') ||
    typeof expression.libraryCExpression === 'string'
  ) {
    return
  }

  const receiverTypeRef = expression.object?.typeRef

  if (
    receiverTypeRef === null ||
    typeof receiverTypeRef === 'undefined' ||
    receiverTypeRef.kind !== 'nominal' ||
    typeof receiverTypeRef.typeId !== 'string'
  ) {
    return
  }

  const libraries = cCompilerLibrarySetValue(context.libraries)
  const operation = compilerLibraryOperationForReceiver(libraries, receiverTypeRef.typeId, '', 'index-read')

  if (operation === null || (operation.variants ?? []).length > 0) {
    return
  }

  expression.libraryBindingId = operation.bindingId
  expression.libraryOperationId = operation.operationId
  expression.libraryRuntimeRequirements = operation.runtimeRequirements
  expression.libraryCExpression = operation.cExpression ?? null
  expression.libraryCArgumentKinds = operation.cArgumentKinds ?? null
  expression.libraryCArgumentAdapters = operation.cArgumentAdapters ?? null
  expression.libraryCArgumentMethodNames = operation.cArgumentMethodNames ?? null
  expression.libraryCArgumentSources = operation.cArgumentSources ?? null
  expression.libraryCResultMode = operation.cResultMode ?? null
  expression.libraryCReceiverAdapter =
    operation.cReceiverAdapter ?? defaultLibraryReceiverAdapter(receiverTypeRef.typeId, context)
  expression.libraryCResultAdapter = operation.cResultAdapter ?? null
  expression.libraryCppType = operation.cResultMapping?.cppType ?? null
  expression.libraryOwned =
    operation.resultTypeRef?.kind !== 'parameter' && operation.resultTypeRef?.ownership === 'owned'
  expression.libraryCCallStyle = operation.cCallStyle ?? null
  expression.libraryCFailureMode = operation.cFailureMode ?? null
  expression.libraryCPreservesPendingException = operation.cPreservesPendingException === true
}

function defaultLibraryReceiverAdapter(typeId: string, context: CFunctionContext): string | null {
  const nativeType = compilerLibraryNativeTypeForId(cCompilerLibrarySetValue(context.libraries), typeId)
  const cppType = nativeType?.cppType

  if (
    cppType === null ||
    typeof cppType === 'undefined' ||
    cppType.length === 0 ||
    cppType === 'inox::Value' ||
    cppType === 'inox_value'
  ) {
    return null
  }

  return `${cppType}($value)`
}

function emitRuntimeStringAssignment(expression: StatementNode, context: CFunctionContext): string[] | null {
  if (expression.target.type !== 'Reference' || expression.target.path.length !== 1) {
    return null
  }

  const path: string[] = expression.target.path
  const target = path[0]

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
  const storage = registerRuntimeStringStorage(target, context)
  const lines: string[] = []

  pushAllLines(lines, value.lines)
  lines.push(emitRuntimeValueCheck(value.expression, 'INOX_TAG_STRING', context))
  lines.push(`${storage} = ${value.expression};`)
  pushPreparedRuntimeValueOwnershipLines(lines, storage, value)
  lines.push(`${emitCIdentifier(target)} = (inox_string*)${storage}.as.ref;`)

  return lines
}

function registerRuntimeStringStorage(name: string, context: CFunctionContext): string {
  const current = context.runtimeStringValues.get(name)

  if (current !== null && typeof current !== 'undefined') {
    return current
  }

  const storage = nextCName(context, `${name}_value`)
  registerOwnedValue(context, storage)
  context.runtimeStringValues.set(name, storage)

  return storage
}

function emitNativeClassExpressionVariableDeclaration(
  statement: StatementNode,
  context: CFunctionContext
): string[] | null {
  if (statement.init === null || typeof statement.init === 'undefined') {
    return null
  }

  const className = nativeClassExpressionVariableDeclarationClassName(statement, context)

  if (className === null || typeof className === 'undefined') {
    return null
  }

  const info = context.classInfos.get(className)

  if (info === null || typeof info === 'undefined' || !info.native) {
    return null
  }

  return emitNativeClassValueVariableDeclaration(
    statement,
    statementDeps(context).emitCValueExpression(statement.init, context),
    context
  )
}

function nativeClassExpressionVariableDeclarationClassName(
  statement: StatementNode,
  context: CFunctionContext
): string | null {
  const statementClassName = stringOrNull(statement.className)

  if (statementClassName !== null) {
    return statementClassName
  }

  if (statement.init === null || typeof statement.init === 'undefined') {
    return null
  }

  const initClassName = stringOrNull(statement.init.className)

  if (initClassName !== null) {
    return initClassName
  }

  if (statement.init.type === 'Reference' && statement.init.path.length === 1) {
    const path: string[] = statement.init.path
    const referenceClassName = context.classInstanceTypes.get(path[0])

    if (referenceClassName !== null && typeof referenceClassName !== 'undefined') {
      return referenceClassName
    }
  }

  if (statement.init.type === 'ThisExpression') {
    const thisClassName = context.classInstanceTypes.get('this')

    if (thisClassName !== null && typeof thisClassName !== 'undefined') {
      return thisClassName
    }
  }

  return null
}

function emitNativeClassValueVariableDeclaration(
  statement: StatementNode,
  value: PreparedExpression,
  context: CFunctionContext
): string[] | null {
  const className = cClassNameFromValueType(value.valueType)

  if (className === null || typeof className === 'undefined') {
    return null
  }

  const lines: string[] = []

  context.variables.set(statement.name, cClassValueTypeName(className))
  context.classInstanceTypes.set(statement.name, className)
  pushAllLines(lines, value.lines)
  lines.push(
    `${emitCClassTypeNameForClassName(context, className)} ${emitCIdentifier(statement.name)} = ${value.expression};`
  )

  return lines
}

function emitRuntimeValueAssignment(expression: StatementNode, context: CFunctionContext): string[] | null {
  if (expression.target.type !== 'Reference' || expression.target.path.length !== 1) {
    return null
  }

  const path: string[] = expression.target.path
  const target = path[0]
  const reference = emitCIdentifier(target)
  const targetType = context.variables.get(target)
  const targetCppType = context.cppValueTypes.get(target)

  if (!isRuntimeValueDeclarationValueType(targetType) && targetCppType !== 'inox::Value') {
    return null
  }

  const deps = statementDeps(context)
  const value = deps.emitCValueExpression(expression.value, context)
  const expectedTag = cRuntimeValueTag(targetType)
  const lines: string[] = []

  pushAllLines(lines, value.lines)

  if (targetCppType !== null && typeof targetCppType !== 'undefined') {
    if (value.cppType !== null && typeof value.cppType !== 'undefined') {
      lines.push(`${reference} = ${value.expression};`)
    } else {
      lines.push(`${reference} = ${targetCppType}(${value.expression});`)
    }

    return lines
  }

  const valueCheck = emitRuntimeValueCheck(value.expression, expectedTag, context)

  if (valueCheck !== '') {
    lines.push(valueCheck)
  }

  lines.push(`${reference} = ${value.expression};`)
  pushPreparedRuntimeValueOwnershipLines(lines, reference, value)

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
    valueType === 'unknown' || isOpaqueRuntimeValueType(valueType) || valueType === 'bytes' || valueType === 'object'
  )
}

export function emitExpressionStatement(statement: StatementNode, context: CFunctionContext): string[] {
  const deps = statementDeps(context)
  const expression: StatementNode = statement.expression

  if (expression.type === 'Reference') {
    return []
  }

  const asyncResultSettlement = deps.emitAsyncResultConstructorSettlementCall(expression, context)

  if (asyncResultSettlement !== null && typeof asyncResultSettlement !== 'undefined') {
    return asyncResultSettlement
  }

  if (expression.type === 'CallExpression') {
    const libraryCall = deps.emitPreparedCompilerLibraryCallExpression(expression, context, { discard: true })

    if (libraryCall !== null) {
      const lines: string[] = []
      pushAllLines(lines, libraryCall.lines)

      if (libraryCall.expression !== '') {
        lines.push(`${libraryCall.expression};`)
      }

      return lines
    }

    const classMethodCall = deps.emitPreparedClassMethodCallExpression(expression, context, { discard: true })

    if (classMethodCall !== null && typeof classMethodCall !== 'undefined') {
      if (classMethodCall.expression === '') {
        return classMethodCall.lines
      }

      const lines: string[] = []
      pushAllLines(lines, classMethodCall.lines)
      lines.push(`${classMethodCall.expression};`)
      return lines
    }

    const asyncResult = deps.emitPreparedAsyncResultStaticExpression(expression, context)

    if (asyncResult !== null && typeof asyncResult !== 'undefined') {
      return asyncResult.lines
    }

    const call = deps.emitPreparedCallExpression(expression, context)

    if (call.expression === '') {
      return call.lines
    }

    const lines: string[] = []
    pushAllLines(lines, call.lines)
    lines.push(`${call.expression};`)
    return lines
  }

  if (expression.type === 'AwaitExpression') {
    const value = deps.emitCAwaitValueExpression(expression, context)

    return emitDiscardedAwaitValueLines(value)
  }

  if (expression.type === 'UpdateExpression') {
    const value = deps.emitPreparedUpdateExpression(expression, context)

    if (expression.prefix === false) {
      return value.lines.slice(1)
    }

    return [`${value.expression.slice(1, value.expression.length - 1)};`]
  }

  if (expression.type === 'AssignmentExpression') {
    const moduleValueAssignment = emitModuleValueAssignmentExpression(expression, context, deps)

    if (moduleValueAssignment !== null && typeof moduleValueAssignment !== 'undefined') {
      return moduleValueAssignment
    }

    const libraryAssignment = deps.emitPreparedCompilerLibraryCallExpression(expression, context, { discard: true })

    if (libraryAssignment !== null) {
      const lines = libraryAssignment.lines

      if (libraryAssignment.expression !== '') {
        lines.push(`${libraryAssignment.expression};`)
      }

      return lines
    }

    const nativeClassFieldAssignment = emitNativeClassFieldAssignment(expression, context)

    if (nativeClassFieldAssignment !== null && typeof nativeClassFieldAssignment !== 'undefined') {
      return nativeClassFieldAssignment
    }

    if (expression.target.type === 'MemberExpression') {
      const member = deps.resolveKnownObjectMember(expression.target, context)

      if (member !== null && typeof member !== 'undefined') {
        return deps.emitKnownObjectMemberAssignment(expression, member, context)
      }
    }

    if (expression.target.type === 'IndexExpression') {
      const field = deps.resolveKnownObjectIndex(expression.target, context)

      if (field !== null && typeof field !== 'undefined') {
        return deps.emitDynamicObjectMemberAssignment(expression, field, context)
      }
    }

    const dynamicObjectFieldAssignment = deps.emitDynamicObjectFieldAssignment(expression, context)

    if (dynamicObjectFieldAssignment !== null && typeof dynamicObjectFieldAssignment !== 'undefined') {
      return dynamicObjectFieldAssignment
    }

    const valueType = deps.inferExpressionType(expression.value, context)

    if (deps.isNullableRuntimeValueAssignment(expression, context)) {
      return deps.emitNullableRuntimeValueAssignment(expression, context)
    }

    if (deps.isBoxedRuntimeValueAssignment(expression, context)) {
      return deps.emitBoxedRuntimeValueAssignment(expression, context)
    }

    const runtimeStringAssignment = emitRuntimeStringAssignment(expression, context)

    if (runtimeStringAssignment !== null && typeof runtimeStringAssignment !== 'undefined') {
      return runtimeStringAssignment
    }

    const runtimeValueAssignment = emitRuntimeValueAssignment(expression, context)

    if (runtimeValueAssignment !== null && typeof runtimeValueAssignment !== 'undefined') {
      return runtimeValueAssignment
    }

    if (valueType === 'number' || valueType === 'boolean') {
      const value = deps.emitPreparedNumberExpression(expression.value, context)

      const lines: string[] = []
      pushAllLines(lines, value.lines)
      lines.push(`${deps.emitReference(expression.target, context)} = ${value.expression};`)
      return lines
    }

    return [`${deps.emitReference(expression.target, context)} = ${deps.emitCExpression(expression.value, context)};`]
  }

  if (expression.type === 'OptionalCallExpression') {
    return deps.emitOptionalRuntimeCallbackCallExpression(expression, context)
  }

  return []
}

function emitDiscardedAwaitValueLines(value: PreparedExpression): string[] {
  const declaredName = value.cppDeclaredName

  if (declaredName === null || typeof declaredName === 'undefined') {
    return value.lines
  }

  const assignment = `auto ${declaredName} = `
  const lines: string[] = []
  let referencedLater = false

  for (let index = 0; index < value.lines.length; index = index + 1) {
    const line = value.lines[index]

    if (line.startsWith(assignment)) {
      for (let laterIndex = index + 1; laterIndex < value.lines.length; laterIndex = laterIndex + 1) {
        if (value.lines[laterIndex].includes(declaredName)) {
          referencedLater = true
          break
        }
      }
      break
    }
  }

  for (const line of value.lines) {
    if (!referencedLater && line.startsWith(assignment)) {
      const initializer = line.endsWith(';')
        ? line.slice(assignment.length, line.length - 1)
        : line.slice(assignment.length)

      lines.push(`(void)(${initializer});`)
    } else {
      lines.push(line)
    }
  }

  return lines
}

function emitModuleValueAssignmentExpression(
  expression: StatementNode,
  context: CFunctionContext,
  deps: StatementLoweringDependencies
): string[] | null {
  if (expression.type !== 'AssignmentExpression' || expression.target.type !== 'Reference') {
    return null
  }

  if (expression.target.path.length !== 1) {
    return null
  }

  const name = joinStrings(expression.target.path, '_')

  if (context.localValueNames.has(name) || !context.moduleValueNames.has(name)) {
    return null
  }

  return deps.emitModuleValueVariableAssignment(
    {
      type: 'VariableDeclaration',
      kind: 'let',
      name,
      init: expression.value,
      valueType: expression.target.valueType,
      typeRef: expression.target.typeRef,
      nullable: expression.target.nullable,
      shape: expression.target.shape,
      functionType: expression.target.functionType,
      asyncResultValueType: expression.target.asyncResultValueType,
      loc: expression.loc
    },
    context
  )
}

function shouldNormalizeCAsyncReturnArgument(argument: StatementNode, context: CFunctionContext): boolean {
  return (
    context.returnType !== 'async-result' &&
    (argument.valueType === 'async-result' ||
      statementDeps(context).inferExpressionType(argument, context) === 'async-result')
  )
}

function cAsyncReturnAwaitExpression(argument: StatementNode, returnType: string, loc: CSourceLocation): StatementNode {
  return {
    type: 'AwaitExpression',
    argument,
    valueType: returnType,
    loc
  }
}

function isRuntimeCallbackReturnContext(context: CFunctionContext): boolean {
  const returnType = context.runtimeCallbackReturnType

  return (
    context.statusReturn === true &&
    returnType !== null &&
    typeof returnType !== 'undefined' &&
    (returnType === 'void' || isNullableScalarType(returnType) || isRuntimeValueReturnType(returnType))
  )
}

function isRuntimeValueReturnType(valueType: string | null | undefined): boolean {
  return valueType === 'unknown' || isManagedRuntimeReturnType(valueType) || isOpaqueRuntimeValueType(valueType)
}

function emitAsyncResultReturnStatement(statement: StatementNode, context: CFunctionContext): string[] {
  const asyncResult = statementDeps(context).emitPreparedAsyncResultExpression(
    statement.argument,
    context,
    preparedAsyncResultReturnOptions()
  )

  if (asyncResult === null || typeof asyncResult === 'undefined') {
    pushDiagnostic(
      context,
      diagnostic(
        'INOX_C_ASYNC',
        'this AsyncResult return expression is not supported by the current C++ backend slice',
        statement.loc
      )
    )

    return emitReturnJump(context)
  }

  const lines: string[] = []
  pushAllLines(lines, asyncResult.lines)
  pushAllLines(lines, emitReturnJump(context))
  return lines
}

function emitRuntimeCallbackReturnStatement(statement: StatementNode, context: CFunctionContext): string[] {
  if (context.runtimeCallbackReturnType === 'void') {
    return emitReturnJump(context)
  }

  const lines: string[] = []

  if (isRuntimeValueReturnType(context.runtimeCallbackReturnType)) {
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

  if (argument !== null && typeof argument !== 'undefined') {
    value = statementDeps(context).emitPreparedNumberExpression(argument, context)
  }

  let expression = `inox_bool_value((${value.expression}) != 0)`

  if (context.runtimeCallbackReturnType === 'number') {
    expression = `inox_number_value(${value.expression})`
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
  const returnType = context.runtimeCallbackReturnType
  const returnOut = context.runtimeCallbackReturnOut

  if (
    returnType === null ||
    typeof returnType === 'undefined' ||
    returnOut === null ||
    typeof returnOut === 'undefined'
  ) {
    return emitReturnJump(context)
  }

  const expectedTag = cRuntimeValueTag(returnType)
  let value: PreparedExpression = {
    lines: [],
    expression: 'inox_undefined_value()'
  }

  if (argument !== null && typeof argument !== 'undefined') {
    value = emitRuntimeReturnValueExpression(argument, context, returnType, context.runtimeCallbackReturnShape)
  }

  const lines: string[] = []
  pushAllLines(lines, value.lines)
  pushRuntimeValueReturnAssignment(lines, returnOut, value, context)
  if (context.returnNullable === true) {
    pushAllLines(lines, emitRuntimeNullableValueCheck(returnOut, expectedTag, context))
  } else {
    lines.push(emitRuntimeValueCheck(returnOut, expectedTag, context))
  }
  lines.push(`inox_retain(${returnOut});`)
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

  if (returnType === 'object') {
    const value = statementDeps(context).emitCValueExpression(argument, context)
    const classInstance = emitPreparedClassInstanceRefValueExpression(value, context)

    if (classInstance !== null && typeof classInstance !== 'undefined') {
      const lines: string[] = []

      pushAllLines(lines, value.lines)
      pushAllLines(lines, classInstance.lines)

      return {
        lines,
        expression: classInstance.expression,
        valueType: classInstance.valueType
      }
    }

    return value
  }

  return statementDeps(context).emitCValueExpression(argument, context)
}

function emitRuntimeValueReturnStatement(statement: StatementNode, context: CFunctionContext): string[] {
  if (statement.argument === null || typeof statement.argument === 'undefined') {
    return emitReturnJump(context)
  }

  const expectedTag = cRuntimeValueTag(context.returnType)
  const nativeValidExpression = compilerLibraryNativeRuntimeValueValidExpressionForTypeId(
    context.libraries,
    context.returnShape?.libraryTypeId
  )
  const value = emitRuntimeReturnValueExpression(statement.argument, context, context.returnType, context.returnShape)

  const lines: string[] = []
  pushAllLines(lines, value.lines)
  pushRuntimeValueReturnAssignment(lines, 'inox_return', value, context)
  pushFunctionReturnCompanionAssignments(lines, statement.argument, value, context)
  if (nativeValidExpression !== null) {
    const valid = nativeValidExpression.split('$value').join('inox_return')
    const mismatch =
      context.returnNullable === true
        ? `inox_return.tag != INOX_TAG_UNDEFINED && inox_return.tag != INOX_TAG_NULL && !(${valid})`
        : `!(${valid})`
    lines.push(emitRuntimeTypeCheck(mismatch, context))
  } else if (context.returnNullable === true) {
    pushAllLines(lines, emitRuntimeNullableValueCheck('inox_return', expectedTag, context))
  } else {
    lines.push(emitRuntimeValueCheck('inox_return', expectedTag, context))
  }
  lines.push('inox_retain(inox_return);')
  pushAllLines(lines, emitReturnJump(context))
  return lines
}

function pushFunctionReturnCompanionAssignments(
  lines: string[],
  argument: StatementNode,
  value: PreparedExpression,
  context: CFunctionContext
): void {
  for (const output of context.returnFunctionCompanions) {
    const source =
      preparedFunctionCompanionForPath(value.functionCompanions, output.path) ??
      referenceFunctionCompanionForPath(argument, output.path, context)

    if (source !== null) {
      lines.push(`if (${output.expression} != 0) *${output.expression} = ${source};`)
    }
  }
}

function preparedFunctionCompanionForPath(
  companions: CPreparedFunctionCompanion[] | null | undefined,
  path: string[]
): string | null {
  if (companions === null || typeof companions === 'undefined') {
    return null
  }

  for (const companion of companions) {
    if (statementFunctionCompanionPathsEqual(companion.path, path)) {
      return companion.expression
    }
  }

  return null
}

function referenceFunctionCompanionForPath(
  argument: StatementNode,
  path: string[],
  context: CFunctionContext
): string | null {
  if (argument.type !== 'Reference' || argument.path.length !== 1) {
    return null
  }

  return statementDeps(context).emitObjectFunctionCompanionReference(argument.path[0], path, context)
}

function statementFunctionCompanionPathsEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false
  }

  for (let index = 0; index < left.length; index = index + 1) {
    if (left[index] !== right[index]) {
      return false
    }
  }

  return true
}

function emitNullableScalarReturnStatement(statement: StatementNode, context: CFunctionContext): string[] {
  const expectedTag = cRuntimeValueTag(context.returnType)
  let value: PreparedExpression = nullRuntimeValueExpression()

  if (statement.argument !== null && typeof statement.argument !== 'undefined') {
    value = statementDeps(context).emitNullableScalarValueExpression(statement.argument, context)
  }

  const lines: string[] = []
  pushAllLines(lines, value.lines)
  pushRuntimeValueReturnAssignment(lines, 'inox_return', value, context)
  pushAllLines(lines, emitRuntimeNullableValueCheck('inox_return', expectedTag, context))
  if (isManagedRuntimeReturnType(context.returnType)) {
    lines.push('inox_retain(inox_return);')
  }
  pushAllLines(lines, emitReturnJump(context))
  return lines
}

function pushRuntimeValueReturnAssignment(
  lines: string[],
  target: string,
  value: PreparedExpression,
  context: CFunctionContext
): void {
  if (value.cppType !== null && typeof value.cppType !== 'undefined' && isManagedRuntimeReturnType(value.valueType)) {
    const temp = nextCName(context, 'inox_return_value')

    lines.push(`auto ${temp} = ${value.expression};`)
    lines.push(`${target} = ${temp};`)
    return
  }

  lines.push(`${target} = ${value.expression};`)
}

export function registerErrorChannel(context: CFunctionContext): void {
  context.errorChannelUsed = true
  registerErrorValue(context)
}

export function registerErrorValue(context: CFunctionContext): void {
  registerOwnedValue(context, 'inox_error')
}

export function currentErrorTarget(context: CFunctionContext): string | null {
  return lastStringOrNull(context.errorTargets)
}

export function currentErrorTargetRequiresActive(context: CFunctionContext): boolean {
  if (context.errorTargetActiveFlags.length === 0) {
    return false
  }

  return context.errorTargetActiveFlags[context.errorTargetActiveFlags.length - 1] === true
}

function pushErrorTarget(context: CFunctionContext, target: string, activeRequired: boolean): void {
  pushStringTarget(context.errorTargets, target)
  context.errorTargetActiveFlags.push(activeRequired)
}

function popErrorTarget(context: CFunctionContext): void {
  popStringTarget(context.errorTargets)
  context.errorTargetActiveFlags.pop()
}

export function emitBreakJump(context: CFunctionContext): string[] {
  const target = currentBreakTarget(context)

  if (target === null || typeof target === 'undefined') {
    return ['break;']
  } else {
    target.used = true
    const label = target.label

    if (target.throughFinally) {
      registerBreakFlow(context)

      return ['inox_break_active = 1;', `goto ${label};`]
    }

    return [`goto ${label};`]
  }
}

export function emitContinueJump(context: CFunctionContext): string[] {
  const target = currentContinueTarget(context)

  if (target === null || typeof target === 'undefined') {
    return ['continue;']
  } else {
    target.used = true
    const label = target.label

    if (target.throughFinally) {
      registerContinueFlow(context)

      return ['inox_continue_active = 1;', `goto ${label};`]
    }

    return [`goto ${label};`]
  }
}

export function emitBreakTargetLabel(label: string, context: CFunctionContext): string[] {
  const lines = [`${label}:`]

  if (context.breakFlowUsed) {
    lines.push('  if (inox_break_active) inox_break_active = 0;')
  }

  lines.push(';')
  return lines
}

export function emitContinueTargetLabel(label: string, context: CFunctionContext): string[] {
  const lines = [`${label}:`]

  if (context.continueFlowUsed) {
    lines.push('  if (inox_continue_active) inox_continue_active = 0;')
  }

  lines.push('  ;')
  return lines
}

function shouldEmitFlowTargetLabel(target: CLoopFlowTarget): boolean {
  return target.used === true
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

export function emitReturnJump(context: CFunctionContext): string[] {
  const target = currentReturnTarget(context)

  if (target !== null && typeof target !== 'undefined') {
    registerReturnFlow(context)

    return ['inox_return_active = 1;', `goto ${target};`]
  }

  return [emitReturnCleanupStatement(context)]
}

export function emitReturnCleanupStatement(context: CFunctionContext): string {
  if (
    context.statusReturn &&
    context.runtimeCallbackCleanupLabel !== null &&
    typeof context.runtimeCallbackCleanupLabel !== 'undefined'
  ) {
    context.usedRuntimeCallbackCleanupGoto = true

    return `goto ${context.runtimeCallbackCleanupLabel};`
  }

  if (context.cleanupEnabled) {
    context.usedCleanupGoto = true

    return 'goto cleanup;'
  }

  if (context.returnType === 'void') {
    return 'return;'
  }

  return 'return inox_return;'
}

function registerReturnFlow(context: CFunctionContext): void {
  context.returnFlowUsed = true
}

export function currentReturnTarget(context: CFunctionContext): string | null {
  return lastStringOrNull(context.returnTargets)
}
