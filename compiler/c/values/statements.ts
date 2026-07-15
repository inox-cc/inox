import { diagnostic } from '../../diagnostics.ts'
import type { RuntimeEntrypointAdapterDescriptor } from '../../extensions/types.ts'
import type { AnyNode, Diagnostic, IrFunctionEffect, SourceLocation } from '../../types.ts'
import { isRuntimeFunctionType, normalizeFunctionType } from '../async/callbacks.ts'
import type { AsyncTaskLoweringDependencies } from '../async/tasks.ts'
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
import { cStringLiteral, emitCIdentifier } from '../identifiers.ts'
import {
  emitRuntimeNullableValueCheck,
  emitRuntimeValueCheck,
  emitRuntimeValueCheckLines,
  runtimeObjectLikeValueMismatchCondition
} from '../runtime-values.ts'
import { cUnsupportedExpressionCode, cUnsupportedVariableDeclarationCode, containsAwaitExpression } from '../syntax.ts'
import type {
  CArrayElementInfo,
  CAsyncTaskWrapper,
  CCallbackWrapper,
  CClassInfo,
  CFunctionParam,
  CFunctionPointerAdapter,
  CFunctionReturnMapType,
  CFunctionType,
  CKnownArrayElement,
  CKnownObjectField,
  CKnownObjectIndexField,
  CObjectAccessorReturnPath,
  CObjectShape,
  CObjectShapeField,
  CPromiseChainWrapper,
  CPromiseConstructorHandler,
  CRuntimeArrayElement,
  CPreparedCallOptions as PreparedCallOptions,
  CPreparedExpression as PreparedExpression
} from '../types.ts'
import {
  cRuntimeValueTag,
  isManagedRuntimeReturnType,
  isNullableScalarType,
  isOpaqueRuntimeValueType,
  isRuntimeNullableType,
  libraryNativeCppType
} from '../value-types.ts'
import type { ArrayLoweringDependencies, PreparedArrayExpression } from './arrays.ts'
import {
  emitPreparedArrayLengthExpression,
  emitPreparedObjectRuntimeArrayIndexValueExpression,
  resolveRuntimeArrayElementType
} from './arrays.ts'
import {
  cClassNameFromValueType,
  cClassValueTypeName,
  emitCClassDescriptorNameForClassName,
  emitCClassTypeNameForClassName,
  emitNativeClassFieldAssignment,
  emitPreparedClassInstanceRefValueExpression
} from './classes.ts'
import type { ClassLoweringDependencies } from './classes.ts'
import type { CollectionLoweringDependencies } from './collections.ts'
import {
  resolveRuntimeForOfMapEntries,
  resolveRuntimeForOfMapKeys,
  resolveRuntimeMapType,
  resolveRuntimeSetElementType
} from './collections.ts'
import { emitCConditionClause, emitCNegatedConditionClause, objectExpressionPathName } from './expressions.ts'
import type { NullableLoweringDependencies } from './nullable.ts'
import { emitNullableRuntimeValueVariableDeclaration } from './nullable.ts'
import { registerObjectShape } from './objects.ts'
import type { StringLoweringDependencies } from './strings.ts'
import { isRawStringLiteralExpression } from './strings.ts'
import { anyNodeLikeObjectFieldDeclaredType, isAnyNodeLikeDeclaredType } from './types.ts'

type CSourceLocation = SourceLocation | null | undefined

type StatementNode = AnyNode

type CLoopFlowTarget = {
  label: string
  throughFinally: boolean
  used?: boolean
}

type CStringMap = Map<string, string>
type CStringSet = Set<string>
type CObjectAccessorReturnPathMap = Map<string, CObjectAccessorReturnPath>

type CVariableTypeNarrowing = {
  name: string
  valueType: string
}

type CTypeofConditionNarrowing = {
  trueTypes: CVariableTypeNarrowing[]
  falseTypes: CVariableTypeNarrowing[]
}

type CFunctionContext = {
  arrayLoweringDependencies: ArrayLoweringDependencies
  arrayLengths: Map<string, number>
  arrayShapes: Map<string, CArrayElementInfo[]>
  asyncTaskLoweringDependencies: AsyncTaskLoweringDependencies
  asyncTaskWrappers: Map<string, CAsyncTaskWrapper>
  boxedMutableCaptureDeclarations: Set<StatementNode>
  boxedValueTypes: CStringMap
  boxedValues: string[]
  boxedVariables: CStringSet
  breakFlowUsed: boolean
  breakTargets: CLoopFlowTarget[]
  callbackArrowWrappers: Map<AnyNode, CCallbackWrapper>
  callbackWrappers: Map<string, CCallbackWrapper>
  classInfos: Map<string, CClassInfo>
  classInstanceTypes: CStringMap
  classLoweringDependencies: ClassLoweringDependencies
  cleanupEnabled: boolean
  collectionLoweringDependencies: CollectionLoweringDependencies
  continueFlowUsed: boolean
  continueTargets: CLoopFlowTarget[]
  cppArrayValues: CStringSet
  cppMapValues: CStringSet
  cppSetValues: CStringSet
  cppStringValues: CStringSet
  cppValueTypes: CStringMap
  diagnostics: Diagnostic[]
  errorChannelUsed: boolean
  exceptionValueNames: CStringSet
  exceptionValueShape: CObjectShape | null
  errorTargets: string[]
  errorTargetActiveFlags: boolean[]
  eventLoopUsed: boolean
  explicitEventLoop: boolean
  externalEventLoop: boolean
  externalEventLoopFunctions: CStringSet
  failureStatement?: string | null
  failureStatementUsed?: boolean
  forceRuntimeStringDeclarations?: CStringSet
  functionAsyncFlags: Map<string, boolean>
  functionErrorOut: string | null
  functionNames: CStringMap
  functionParams: Map<string, CFunctionParam[]>
  functionPointerAdapterNames: CStringMap
  functionPointerAdapters: CFunctionPointerAdapter[]
  functionReturnArrayElementDeclaredTypes: Map<string, string | null>
  functionReturnArrayElementTypes: Map<string, string | null>
  functionReturnDeclaredTypes: Map<string, string | null>
  functionReturnMapTypes: Map<string, CFunctionReturnMapType>
  functionReturnNullables: Map<string, boolean>
  functionReturnOut: string | null
  functionReturnPromiseValueTypes: Map<string, string | null>
  functionReturnSetElementTypes: Map<string, string | null>
  functionReturnShapes: Map<string, CObjectShape | null>
  functionReturnTypes: CStringMap
  functionThrowValueTypes: Map<string, IrFunctionEffect['throwValueTypes']>
  functionTypes: Map<string, CFunctionType>
  jsGlobalRoots: CStringSet
  runtimeInitializerDefinitions: string[]
  localValueNames: CStringSet
  mapTypes: Map<string, CFunctionReturnMapType>
  moduleObjectShapes: Map<string, CObjectShapeField[]>
  moduleValueDeclarationScope: boolean
  moduleValueCppTypes: CStringMap
  moduleValueNames: CStringMap
  moduleRuntimeValueNames: CStringSet
  moduleValueTypes: CStringMap
  narrowedNullableScalars: CStringSet
  nextId: number
  nullableLoweringDependencies: NullableLoweringDependencies
  nullableVariables: CStringSet
  objectAccessorReturnPaths: CObjectAccessorReturnPathMap
  objectAliases: CStringMap
  objectDeclaredTypes: CStringMap
  objectShapes: Map<string, CObjectShapeField[]>
  ownedPromises: string[]
  ownedValues: string[]
  runtimeEntryPath: string | null
  runtimeEntrypointAdapter: RuntimeEntrypointAdapterDescriptor | null
  promiseChainArrowWrappers: Map<AnyNode, CPromiseChainWrapper>
  promiseChainWrappers: Map<string, CPromiseChainWrapper>
  promiseConstructorHandlers: Map<string, CPromiseConstructorHandler>
  promiseRejectionValueTypes: CStringMap
  promiseValueTypes: CStringMap
  returnFlowUsed: boolean
  returnNullable: boolean
  returnShape?: CObjectShape | null
  returnTargets: string[]
  returnType: string
  runtimeArrayElementTypes: CStringMap
  runtimeCallbackCleanupLabel?: string
  runtimeCallbackReturnOut?: string
  runtimeCallbackReturnShape?: CObjectShape | null
  runtimeCallbackReturnType?: string
  runtimeCallbacks: CStringSet
  runtimeStrings: CStringSet
  runtimeStringValues: CStringMap
  runtimeValueStorageNames: CStringSet
  runtimeFunctionParams: Map<string, CFunctionType>
  setElementTypes: CStringMap
  statementLoweringDependencies: StatementLoweringDependencies
  statusReturn: boolean
  stringLoweringDependencies: StringLoweringDependencies
  throwingFunction: boolean
  throwingFunctions: CStringSet
  unhandledRejectionFlag: string | null
  usedCleanupGoto: boolean
  usedRuntimeCallbackCleanupGoto?: boolean
  variables: CStringMap
}

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
  cppObject: boolean
  keyType: string
  lines: string[]
  name: string
  valueType: string
}

type RuntimeForOfMapValues = {
  cppObject: boolean
  elementType: string
  lines: string[]
  name: string
  useKey: boolean
}

type RuntimeMapMetadata = {
  key: string
  value: string
}

type RuntimeForOfSet = {
  cppObject: boolean
  elementType: string
  lines: string[]
  name: string
}

type NullableScalarConditionNarrowing = {
  trueNames: string[]
  falseNames: string[]
}

type RuntimeArrayConditionNarrowing = {
  trueNames: string[]
  falseNames: string[]
}

type RuntimeObjectConditionNarrowing = {
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
  emitArrayMapVariableDeclaration(
    statement: StatementNode,
    mapped: PreparedArrayExpression,
    context: CFunctionContext
  ): string[]
  emitArraySortVariableDeclaration(
    statement: StatementNode,
    sorted: PreparedArrayExpression,
    context: CFunctionContext
  ): string[]
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
  collectionConstructorName(expression: StatementNode): string | null
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
  emitKnownArrayIndexAssignment(
    expression: StatementNode,
    element: CKnownArrayElement,
    context: CFunctionContext
  ): string[]
  emitKnownArrayIndexVariableDeclaration(
    statement: StatementNode,
    element: CKnownArrayElement,
    context: CFunctionContext
  ): string[]
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
  emitObjectVariableDeclaration(statement: StatementNode, context: CFunctionContext): string[]
  emitOptionalRuntimeCallbackCallExpression(expression: StatementNode, context: CFunctionContext): string[]
  emitArraySliceVariableDeclaration(
    statement: StatementNode,
    sliced: PreparedArrayExpression,
    context: CFunctionContext
  ): string[]
  emitPreparedArrayFilterCallExpression(
    expression: StatementNode,
    context: CFunctionContext
  ): PreparedArrayExpression | null
  emitPreparedArrayFromCallExpression(
    expression: StatementNode,
    context: CFunctionContext
  ): PreparedArrayExpression | null
  emitPreparedArrayMapCallExpression(
    expression: StatementNode,
    context: CFunctionContext
  ): PreparedArrayExpression | null
  emitPreparedArrayPopCallExpression(
    expression: StatementNode,
    context: CFunctionContext,
    options: PreparedCallOptions | null
  ): PreparedExpression | null
  emitPreparedArrayPushCallExpression(expression: StatementNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedArrayReduceCallExpression(expression: StatementNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedArraySliceCallExpression(
    expression: StatementNode,
    context: CFunctionContext
  ): PreparedArrayExpression | null
  emitPreparedArraySortCallExpression(
    expression: StatementNode,
    context: CFunctionContext
  ): PreparedArrayExpression | null
  emitPreparedArrayUnshiftCallExpression(
    expression: StatementNode,
    context: CFunctionContext
  ): PreparedExpression | null
  emitPreparedAsyncFunctionPromiseCallExpression(
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
  emitPreparedCollectionCallExpression(expression: StatementNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedMapIndexAssignment(expression: StatementNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedNumberExpression(expression: StatementNode, context: CFunctionContext): PreparedExpression
  emitPreparedInlineObjectRuntimeCallExpression(
    expression: StatementNode,
    context: CFunctionContext
  ): PreparedExpression | null
  emitPreparedRuntimeTruthinessExpression(
    expression: StatementNode,
    context: CFunctionContext
  ): PreparedExpression | null
  emitPreparedCompilerLibraryCallExpression(
    expression: StatementNode,
    context: CFunctionContext,
    options?: PreparedCallOptions
  ): PreparedExpression | null
  emitPreparedPromiseConstructorExpression(
    expression: StatementNode,
    context: CFunctionContext,
    options?: PreparedCallOptions
  ): PreparedExpression | null
  emitPreparedPromiseExpression(
    expression: StatementNode,
    context: CFunctionContext,
    options?: PreparedCallOptions
  ): PreparedExpression | null
  emitPreparedPromiseMethodExpression(
    expression: StatementNode,
    context: CFunctionContext,
    options?: PreparedCallOptions
  ): PreparedExpression | null
  emitPreparedPromiseReturningCallExpression(
    expression: StatementNode,
    context: CFunctionContext,
    options?: PreparedCallOptions
  ): PreparedExpression | null
  emitPreparedPromiseStaticExpression(
    expression: StatementNode,
    context: CFunctionContext,
    options?: PreparedCallOptions
  ): PreparedExpression | null
  emitPreparedUpdateExpression(expression: StatementNode, context: CFunctionContext): PreparedExpression
  emitPromiseConstructorSettlementCall(expression: StatementNode, context: CFunctionContext): string[] | null
  emitReference(expression: StatementNode, context: CFunctionContext): string
  emitModuleValueVariableAssignment(statement: StatementNode, context: CFunctionContext): string[]
  emitRuntimeCallbackVariableDeclaration(statement: StatementNode, context: CFunctionContext): string[]
  emitScalarVariableDeclaration(statement: StatementNode, context: CFunctionContext): string[]
  emitStatement(statement: StatementNode, context: CFunctionContext): string[]
  emitStringExpression(expression: StatementNode, context: CFunctionContext): string
  inferCatchBindingValueType(statement: StatementNode, context: CFunctionContext): string
  inferExpressionType(expression: StatementNode, context: CFunctionContext): string
  isArrayMethodCall(expression: StatementNode): boolean
  isBoxedRuntimeValueAssignment(expression: StatementNode, context: CFunctionContext): boolean
  isClassConstructorExpression(expression: StatementNode, context: CFunctionContext): boolean
  isCollectionConstructorExpression(expression: StatementNode): boolean
  isExceptionValueExpression(expression: StatementNode, context: CFunctionContext): boolean
  isObjectRuntimeCallExpression(expression: StatementNode): boolean
  isIndexAccessExpression(expression: StatementNode): boolean
  isDynamicRuntimeValueExpression(expression: StatementNode, context: CFunctionContext): boolean
  isMemberAccessExpression(expression: StatementNode): boolean
  isNullableRuntimeValueAssignment(expression: StatementNode, context: CFunctionContext): boolean
  isRuntimeProducedStringExpression(expression: StatementNode, context: CFunctionContext): boolean
  registerExceptionValueShape(context: CFunctionContext, name: string): void
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
}

function statementDeps(context: CFunctionContext): StatementLoweringDependencies {
  return context.statementLoweringDependencies
}

function pushAllLines(target: string[], source: string[]): void {
  for (const line of source) {
    target.push(line)
  }
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
    returnArrayElementType: stringOrNull(expression.returnArrayElementType),
    returnMapKeyType: stringOrNull(expression.returnMapKeyType),
    returnMapValueType: stringOrNull(expression.returnMapValueType),
    returnNullable: expression.returnNullable === true,
    returnPromiseValueType: stringOrNull(expression.returnPromiseValueType),
    returnSetElementType: stringOrNull(expression.returnSetElementType),
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
  if (
    statement.type !== 'IfStatement' ||
    (statement.alternate !== null && typeof statement.alternate !== 'undefined') ||
    !statementDefinitelyReturns(statement.consequent)
  ) {
    return
  }

  const narrowing = statementDeps(context).resolveNullableScalarConditionNarrowing(statement.condition, context)

  narrowNullableScalars(context, narrowing.falseNames)

  const arrayNarrowing = resolveRuntimeArrayConditionNarrowing(statement.condition)

  narrowRuntimeArrays(context, arrayNarrowing.falseNames)
}

function statementDefinitelyReturns(statement: StatementNode): boolean {
  if (statement.type === 'ReturnStatement') {
    return true
  }

  if (statement.type === 'BlockStatement') {
    return statementBodyDefinitelyReturns(statement.body)
  }

  if (statement.type === 'IfStatement' && statement.alternate !== null && typeof statement.alternate !== 'undefined') {
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

function runtimeMapMetadata(key: string, value: string): RuntimeMapMetadata {
  return {
    key,
    value
  }
}

function emptyRuntimeArrayConditionNarrowing(): RuntimeArrayConditionNarrowing {
  return {
    trueNames: [],
    falseNames: []
  }
}

function emptyRuntimeObjectConditionNarrowing(): RuntimeObjectConditionNarrowing {
  return {
    trueNames: [],
    falseNames: []
  }
}

function resolveRuntimeArrayConditionNarrowing(
  expression: StatementNode | null | undefined
): RuntimeArrayConditionNarrowing {
  if (expression === null || typeof expression === 'undefined') {
    return emptyRuntimeArrayConditionNarrowing()
  }

  if (expression.type === 'UnaryExpression' && expression.operator === '!') {
    const inner = resolveRuntimeArrayConditionNarrowing(expression.argument)

    return {
      trueNames: inner.falseNames,
      falseNames: inner.trueNames
    }
  }

  const name = arrayIsArrayReferenceName(expression)

  if (name === null || typeof name === 'undefined') {
    return emptyRuntimeArrayConditionNarrowing()
  }

  return {
    trueNames: [name],
    falseNames: []
  }
}

function resolveRuntimeObjectConditionNarrowing(
  expression: StatementNode | null | undefined
): RuntimeObjectConditionNarrowing {
  if (expression === null || typeof expression === 'undefined') {
    return emptyRuntimeObjectConditionNarrowing()
  }

  if (expression.type === 'UnaryExpression' && expression.operator === '!') {
    const inner = resolveRuntimeObjectConditionNarrowing(expression.argument)

    return {
      trueNames: inner.falseNames,
      falseNames: inner.trueNames
    }
  }

  const name = arrayIsArrayReferenceName(expression)

  if (name === null || typeof name === 'undefined') {
    return emptyRuntimeObjectConditionNarrowing()
  }

  return {
    trueNames: [],
    falseNames: [name]
  }
}

function arrayIsArrayReferenceName(expression: StatementNode): string | null {
  if (expression.type !== 'CallExpression' || expression.args.length !== 1) {
    return null
  }

  const callee = expression.callee

  if (callee.type !== 'MemberExpression' || callee.property !== 'isArray' || callee.object.type !== 'Reference') {
    return null
  }

  const calleePath: string[] = callee.object.path

  if (calleePath.length !== 1 || calleePath[0] !== 'Array') {
    return null
  }

  const argument = expression.args[0]

  if (argument.type !== 'Reference' || argument.path.length !== 1) {
    return null
  }

  return argument.path[0]
}

function narrowRuntimeArrays(context: CFunctionContext, names: string[]): void {
  for (const name of names) {
    context.variables.set(name, 'array')

    if (!context.runtimeArrayElementTypes.has(name)) {
      context.runtimeArrayElementTypes.set(name, 'unknown')
    }
  }
}

function narrowRuntimeObjects(context: CFunctionContext, names: string[]): void {
  for (const name of names) {
    context.variables.set(name, 'object')
  }
}

function preparedCallOut(name: string): PreparedCallOptions {
  return {
    out: name
  }
}

function preparedCallDiscard(): PreparedCallOptions {
  return {
    discard: true
  }
}

function preparedPromiseReturnOptions(): PreparedCallOptions {
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

function arrayVariableDeclarationNode(name: string, init: StatementNode): StatementNode {
  return {
    kind: 'const',
    name,
    init
  }
}

function referenceNode(name: string): StatementNode {
  return {
    type: 'Reference',
    path: [name]
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
  statement: StatementNode,
  context: CFunctionContext,
  narrowedNames: string[],
  runtimeArrayNames: string[],
  runtimeObjectNames: string[],
  variableTypeNarrowings: CVariableTypeNarrowing[]
): string[] {
  const variableScope = pushVariableScope(context)
  const nullableScope = pushNullableScalarNarrowing(context, narrowedNames)
  applyVariableTypeNarrowings(context, variableTypeNarrowings)
  narrowRuntimeArrays(context, runtimeArrayNames)
  narrowRuntimeObjects(context, runtimeObjectNames)
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
  const arrayNarrowing = resolveRuntimeArrayConditionNarrowing(statement.condition)
  const objectNarrowing = resolveRuntimeObjectConditionNarrowing(statement.condition)
  const typeNarrowing = resolveTypeofConditionNarrowing(statement.condition)
  const lines: string[] = []
  pushAllLines(lines, condition.lines)
  lines.push(`if ${emitCConditionClause(condition.expression)} {`)
  pushIndentedLines(
    lines,
    emitScopedStatementBody(
      statement.consequent,
      context,
      narrowing.trueNames,
      arrayNarrowing.trueNames,
      objectNarrowing.trueNames,
      typeNarrowing.trueTypes
    ),
    '  '
  )

  if (statement.alternate === null || typeof statement.alternate === 'undefined') {
    lines.push('}')
    return lines
  }

  lines.push('} else {')
  pushIndentedLines(
    lines,
    emitScopedStatementBody(
      statement.alternate,
      context,
      narrowing.falseNames,
      arrayNarrowing.falseNames,
      objectNarrowing.falseNames,
      typeNarrowing.falseTypes
    ),
    '  '
  )
  lines.push('}')

  return lines
}

export function emitWhileStatement(statement: StatementNode, context: CFunctionContext): string[] {
  const condition = emitPreparedConditionExpression(statement.condition, context)
  const narrowing = statementDeps(context).resolveNullableScalarConditionNarrowing(statement.condition, context)
  const arrayNarrowing = resolveRuntimeArrayConditionNarrowing(statement.condition)
  const objectNarrowing = resolveRuntimeObjectConditionNarrowing(statement.condition)
  const typeNarrowing = resolveTypeofConditionNarrowing(statement.condition)
  const breakTarget: CLoopFlowTarget = { label: nextCName(context, 'inox_break'), throughFinally: false }
  const continueTarget: CLoopFlowTarget = { label: nextCName(context, 'inox_continue'), throughFinally: false }
  pushFlowTarget(context.breakTargets, breakTarget)
  pushFlowTarget(context.continueTargets, continueTarget)
  const body = emitScopedStatementBody(
    statement.body,
    context,
    narrowing.trueNames,
    arrayNarrowing.trueNames,
    objectNarrowing.trueNames,
    typeNarrowing.trueTypes
  )
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
    const test = emitPreparedForExpressionClause(statement.test, context)
    const update = emitPreparedForExpressionClause(statement.update, context)
    const narrowing = statementDeps(context).resolveNullableScalarConditionNarrowing(statement.test, context)
    const arrayNarrowing = resolveRuntimeArrayConditionNarrowing(statement.test)
    const objectNarrowing = resolveRuntimeObjectConditionNarrowing(statement.test)
    const typeNarrowing = resolveTypeofConditionNarrowing(statement.test)
    const breakTarget: CLoopFlowTarget = { label: nextCName(context, 'inox_break'), throughFinally: false }
    const continueTarget: CLoopFlowTarget = { label: nextCName(context, 'inox_continue'), throughFinally: false }
    pushFlowTarget(context.breakTargets, breakTarget)
    pushFlowTarget(context.continueTargets, continueTarget)
    const body = emitScopedStatementBody(
      statement.body,
      context,
      narrowing.trueNames,
      arrayNarrowing.trueNames,
      objectNarrowing.trueNames,
      typeNarrowing.trueTypes
    )
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

  const runtimeElement = deps.resolveRuntimeArrayIndex(statement.init, context)
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

  if (runtimeElement !== null && typeof runtimeElement !== 'undefined' && runtimeElement.valueType === 'string') {
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
  const runtimeElement = deps.resolveRuntimeArrayIndex(statement.init, context)
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

  if (runtimeElement !== null && typeof runtimeElement !== 'undefined' && runtimeElement.valueType === 'function') {
    return emitRuntimeArrayFunctionValueVariableDeclaration(statement, runtimeElement, context)
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

function emitRuntimeArrayFunctionValueVariableDeclaration(
  statement: StatementNode,
  element: CRuntimeArrayElement,
  context: CFunctionContext
): string[] {
  const deps = statementDeps(context)
  const functionType = normalizeFunctionType(element.functionType ?? statement.functionType)
  const value = deps.emitCValueExpression(statement.init, context)
  const lines: string[] = []

  registerOwnedValue(context, statement.name)
  context.variables.set(statement.name, 'function')
  context.functionTypes.set(statement.name, functionType)
  context.runtimeCallbacks.add(statement.name)

  pushAllLines(lines, value.lines)
  lines.push(`${emitCIdentifier(statement.name)} = ${value.expression};`)
  lines.push(emitRuntimeValueCheck(emitCIdentifier(statement.name), 'INOX_TAG_FUNCTION', context))
  pushPreparedRuntimeValueOwnershipLines(lines, emitCIdentifier(statement.name), value)

  return lines
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
        'this expression is not supported by the current C backend slice',
        statement.loc
      )
    )
    return [`double ${emitCIdentifier(statement.name)} = 0;`]
  }

  let arrayLength: PreparedExpression | null = null

  if (statement.init.type === 'MemberExpression' && statement.init.property === 'length') {
    arrayLength = emitPreparedArrayLengthExpression(statement.init, context)
  }

  if (arrayLength !== null && typeof arrayLength !== 'undefined') {
    const lines: string[] = []
    const lengthExpression: string = arrayLength.expression
    const line: string = `${constPrefix(statement.kind === 'const')}double ${emitCIdentifier(statement.name)} = ${lengthExpression};`

    pushAllLines(lines, arrayLength.lines)
    lines.push(line)

    return lines
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
  valueTypeOverride?: string | null
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

  registerRuntimeValueMetadata(statement.name, valueType, statement, expression, context)

  if (value.cppType === 'Array') {
    context.cppArrayValues.add(statement.name)
  }
  registerCppValueType(statement.name, value.cppType, value.valueType ?? valueType, context)

  const lines: string[] = []
  pushAllLines(lines, value.lines)
  lines.push(emitLocalRuntimeValueDeclaration(statement, value))

  if (shouldSkipRuntimeValueDeclarationCheck(statement, value, valueType)) {
    pushAwaitVariableDeclarationSpacing(lines, expression)
    return lines
  }

  if (statement.nullable === true && isRuntimeNullableType(valueType)) {
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

function emitObjectRuntimeCallValueVariableDeclaration(
  statement: StatementNode,
  context: CFunctionContext
): string[] | null {
  if (statement.init === null || typeof statement.init === 'undefined') {
    return null
  }

  const value = statementDeps(context).emitPreparedInlineObjectRuntimeCallExpression(statement.init, context)

  if (value === null || typeof value === 'undefined') {
    return null
  }

  registerRuntimeValueMetadata(statement.name, 'array', statement, statement.init, context)
  registerCppValueType(statement.name, value.cppType, value.valueType ?? 'array', context)

  const lines: string[] = []
  pushAllLines(lines, value.lines)
  lines.push(`auto ${emitCIdentifier(statement.name)} = ${value.expression};`)
  const failureStatement = statementDeps(context).emitFailureStatement(context)
  lines.push(`if (inox::thrown()) ${failureStatement}`)

  return lines
}

function emitObjectRuntimeArrayIndexValueVariableDeclaration(
  statement: StatementNode,
  context: CFunctionContext
): string[] | null {
  const value = emitPreparedObjectRuntimeArrayIndexValueExpression(
    statement.init,
    context,
    emitCIdentifier(statement.name)
  )

  if (value === null || typeof value === 'undefined') {
    return null
  }

  const valueType = value.valueType ?? statementDeps(context).inferExpressionType(statement.init, context)

  registerRuntimeValueMetadata(statement.name, valueType, statement, statement.init, context)

  const lines: string[] = []
  pushAllLines(lines, value.lines)

  if (shouldSkipRuntimeValueDeclarationCheck(statement, value, valueType)) {
    return lines
  }

  const valueCheck = emitRuntimeValueCheck(emitCIdentifier(statement.name), cRuntimeValueTag(valueType), context)

  if (valueCheck !== '') {
    lines.push(valueCheck)
  }

  return lines
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

  if (valueType === 'object') {
    registerObjectShape(context, name, resolveRuntimeObjectShape(declaration, expression, context))
    registerObjectAlias(context, name, expression)
    registerRuntimeObjectDeclaredType(context, name, declaration, expression)
  } else if (valueType === 'array') {
    context.runtimeArrayElementTypes.set(name, resolveRuntimeArrayMetadataElementType(declaration, expression, context))
  } else if (valueType === 'map') {
    let mapType: RuntimeMapMetadata | null = null

    if (expression !== null && typeof expression !== 'undefined') {
      mapType = resolveRuntimeMapType(expression, context)
    }

    context.mapTypes.set(
      name,
      runtimeMapMetadata(
        resolveRuntimeMapMetadataKeyType(declaration, expression, mapType),
        resolveRuntimeMapMetadataValueType(declaration, expression, mapType)
      )
    )
  } else if (valueType === 'set') {
    context.setElementTypes.set(name, resolveRuntimeSetMetadataElementType(declaration, expression, context))
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
  const declarationType = knownDeclaredType(declaration.declaredType)

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
    declaredType: runtimeObjectLiteralFieldDeclaredType(value),
    valueType: runtimeObjectLiteralFieldValueType(value, context),
    arrayElementType: value.arrayElementType,
    mapKeyType: value.mapKeyType,
    mapValueType: value.mapValueType,
    setElementType: value.setElementType,
    shape,
    functionType: value.functionType
  }
}

function runtimeObjectLiteralFieldDeclaredType(value: StatementNode): string | null | undefined {
  const arrayElementDeclaredType = value.arrayElementDeclaredType

  if (arrayElementDeclaredType !== null && typeof arrayElementDeclaredType !== 'undefined') {
    return arrayElementDeclaredType
  }

  return value.declaredType
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

function resolveRuntimeArrayMetadataElementType(
  declaration: StatementNode,
  expression: StatementNode | null | undefined,
  context: CFunctionContext
): string {
  if (declaration.arrayElementType !== null && typeof declaration.arrayElementType !== 'undefined') {
    return declaration.arrayElementType
  }

  const resolvedElementType = resolveRuntimeArrayElementType(expression, context) ?? ''

  if (resolvedElementType !== '') {
    return resolvedElementType
  }

  if (
    expression !== null &&
    typeof expression !== 'undefined' &&
    expression.arrayElementType !== null &&
    typeof expression.arrayElementType !== 'undefined'
  ) {
    return expression.arrayElementType
  }

  return 'unknown'
}

function resolveRuntimeMapMetadataKeyType(
  declaration: StatementNode,
  expression: StatementNode | null | undefined,
  mapType: RuntimeMapMetadata | null
): string {
  if (declaration.mapKeyType !== null && typeof declaration.mapKeyType !== 'undefined') {
    return declaration.mapKeyType
  }

  if (mapType !== null && typeof mapType !== 'undefined') {
    return mapType.key
  }

  if (
    expression !== null &&
    typeof expression !== 'undefined' &&
    expression.mapKeyType !== null &&
    typeof expression.mapKeyType !== 'undefined'
  ) {
    return expression.mapKeyType
  }

  return 'unknown'
}

function resolveRuntimeMapMetadataValueType(
  declaration: StatementNode,
  expression: StatementNode | null | undefined,
  mapType: RuntimeMapMetadata | null
): string {
  if (declaration.mapValueType !== null && typeof declaration.mapValueType !== 'undefined') {
    return declaration.mapValueType
  }

  if (mapType !== null && typeof mapType !== 'undefined') {
    return mapType.value
  }

  if (
    expression !== null &&
    typeof expression !== 'undefined' &&
    expression.mapValueType !== null &&
    typeof expression.mapValueType !== 'undefined'
  ) {
    return expression.mapValueType
  }

  return 'unknown'
}

function resolveRuntimeSetMetadataElementType(
  declaration: StatementNode,
  expression: StatementNode | null | undefined,
  context: CFunctionContext
): string {
  if (declaration.setElementType !== null && typeof declaration.setElementType !== 'undefined') {
    return declaration.setElementType
  }

  let resolvedElementType: string | null = null

  if (expression !== null && typeof expression !== 'undefined') {
    resolvedElementType = resolveRuntimeSetElementType(expression, context)
  }

  if (resolvedElementType !== null && typeof resolvedElementType !== 'undefined') {
    return resolvedElementType
  }

  if (
    expression !== null &&
    typeof expression !== 'undefined' &&
    expression.setElementType !== null &&
    typeof expression.setElementType !== 'undefined'
  ) {
    return expression.setElementType
  }

  return 'unknown'
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

export function reportCCollectionHashability(
  valueType: string | null | undefined,
  subject: string,
  loc: CSourceLocation,
  context: CFunctionContext
): void {
  if (
    valueType === null ||
    typeof valueType === 'undefined' ||
    valueType === 'unknown' ||
    isCCollectionHashableType(valueType)
  ) {
    return
  }

  pushDiagnostic(
    context,
    diagnostic('INOX_C_COLLECTION', `${subject} must be hashable in the current C backend slice`, loc)
  )
}

function isCCollectionHashableType(valueType: string): boolean {
  return valueType === 'number' || valueType === 'boolean' || isManagedRuntimeReturnType(valueType)
}

function isCForOfArrayElementType(valueType: string): boolean {
  return isCForOfValueType(valueType)
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
  } else if (elementType === 'array') {
    context.runtimeArrayElementTypes.set(name, stringOrUnknown(statement.arrayElementType))
  } else if (elementType === 'map') {
    context.mapTypes.set(
      name,
      runtimeMapMetadata(stringOrUnknown(statement.mapKeyType), stringOrUnknown(statement.mapValueType))
    )
  } else if (elementType === 'set') {
    context.setElementTypes.set(name, stringOrUnknown(statement.setElementType))
  }
}

function registerForOfObjectElementDeclaredType(
  context: CFunctionContext,
  name: string,
  statement: StatementNode
): void {
  const declaredType = statement.arrayElementDeclaredType ?? statement.declaredType

  if (declaredType !== null && typeof declaredType !== 'undefined') {
    context.objectDeclaredTypes.set(name, declaredType)
  } else {
    context.objectDeclaredTypes.delete(name)
  }
}

function emitForOfElementDeclaration(
  name: string,
  value: string,
  elementType: string,
  context: CFunctionContext
): PreparedExpression {
  let declaration = `double ${name} = ${value}.as.number;`
  const checks: string[] = []

  if (elementType === 'string') {
    declaration = `inox_string* ${name} = (inox_string*)${value}.as.ref;`
    checks.push(emitRuntimeTypeCheck(`${value}.tag != INOX_TAG_STRING || ${value}.as.ref == 0`, context))
  } else if (elementType === 'unknown') {
    declaration = `inox_value ${name} = ${value};`
  } else if (elementType === 'boolean') {
    declaration = `double ${name} = ((double)(${value}.as.boolean ? 1 : 0));`
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

function shouldEmitRuntimeArrayValueBinding(elementType: string): boolean {
  return elementType === 'unknown' || elementType === 'object'
}

function emitCollectionVariableDeclaration(statement: StatementNode, context: CFunctionContext): string[] {
  const deps = statementDeps(context)
  const collectionConstructor = deps.collectionConstructorName(statement.init)

  if (collectionConstructor === null || typeof collectionConstructor === 'undefined') {
    pushDiagnostic(
      context,
      diagnostic(
        'INOX_C_COLLECTION',
        'this collection constructor is not supported by the current C backend slice',
        statement.loc
      )
    )
    return [`double ${emitCIdentifier(statement.name)} = 0;`]
  }

  const args: StatementNode[] = statement.init.args

  if (args.length > 1) {
    pushDiagnostic(
      context,
      diagnostic(
        'INOX_C_COLLECTION',
        'C collection constructors currently support at most one array literal iterable',
        statement.init.loc
      )
    )
  }

  let constructorArg: StatementNode | null = null

  if (args.length > 0) {
    constructorArg = args[0]
  }

  if (collectionConstructor === 'Map') {
    const mapKeyType = stringOrUnknown(statement.mapKeyType)
    const mapValueType = stringOrUnknown(statement.mapValueType)
    context.variables.set(statement.name, 'map')
    context.cppMapValues.add(statement.name)
    context.mapTypes.set(statement.name, runtimeMapMetadata(mapKeyType, mapValueType))
    reportCCollectionHashability(statement.mapKeyType, 'Map keys', statement.loc, context)

    const copied = emitCollectionVariableCopyConstructor(statement, context)

    if (copied !== null && typeof copied !== 'undefined') {
      return copied
    }

    const lines: string[] = []
    lines.push(`auto ${emitCIdentifier(statement.name)} = Map::create();`)
    lines.push(emitRuntimeTypeCheck(`!${emitCIdentifier(statement.name)}.valid()`, context))

    pushAllLines(lines, emitMapConstructorEntries(statement.name, constructorArg, context, statement.init.loc))

    return lines
  }

  context.variables.set(statement.name, 'set')
  context.cppSetValues.add(statement.name)
  context.setElementTypes.set(statement.name, stringOrUnknown(statement.setElementType))
  reportCCollectionHashability(statement.setElementType, 'Set values', statement.loc, context)

  const copied = emitCollectionVariableCopyConstructor(statement, context)

  if (copied !== null && typeof copied !== 'undefined') {
    return copied
  }

  const lines: string[] = []
  lines.push(`auto ${emitCIdentifier(statement.name)} = Set::create();`)
  lines.push(emitRuntimeTypeCheck(`!${emitCIdentifier(statement.name)}.valid()`, context))

  pushAllLines(lines, emitSetConstructorValues(statement.name, constructorArg, context, statement.init.loc))

  return lines
}

function emitCollectionVariableCopyConstructor(statement: StatementNode, context: CFunctionContext): string[] | null {
  const args: StatementNode[] = statement.init.args
  let expression: StatementNode | null = null

  if (args.length > 0) {
    expression = args[0]
  }

  if (expression === null || typeof expression === 'undefined' || expression.type === 'ArrayLiteral') {
    return null
  }

  const value = statementDeps(context).emitCValueExpression(statement.init, context)
  const lines: string[] = []

  pushAllLines(lines, value.lines)
  lines.push(`auto ${emitCIdentifier(statement.name)} = ${value.expression};`)

  return lines
}

function emitMapConstructorEntries(
  name: string,
  expression: StatementNode | null | undefined,
  context: CFunctionContext,
  loc: CSourceLocation
): string[] {
  const deps = statementDeps(context)

  if (expression === null || typeof expression === 'undefined') {
    return []
  }

  if (expression.type !== 'ArrayLiteral') {
    pushDiagnostic(
      context,
      diagnostic(
        'INOX_C_COLLECTION',
        'C Map constructor currently supports only array literal entries or Map copy sources',
        nodeLocOrFallback(expression, loc)
      )
    )
    return []
  }

  const lines: string[] = []

  for (const entry of expression.elements) {
    if (entry.type !== 'ArrayLiteral' || entry.elements.length !== 2) {
      pushDiagnostic(
        context,
        diagnostic(
          'INOX_C_COLLECTION',
          'C Map constructor entries must be [key, value] array literals',
          nodeLocOrFallback(entry, loc)
        )
      )
      continue
    }

    const entryElements: StatementNode[] = entry.elements
    const keyNode = entryElements[0]
    const valueNode = entryElements[1]
    const key = deps.emitCValueExpression(keyNode, context)
    const value = deps.emitCValueExpression(valueNode, context)
    reportCCollectionHashability(
      deps.inferExpressionType(keyNode, context),
      'Map keys',
      nodeLocOrFallback(keyNode, nodeLocOrFallback(entry, loc)),
      context
    )

    pushAllLines(lines, key.lines)
    pushAllLines(lines, value.lines)
    lines.push(`${emitCIdentifier(name)}.set(${key.expression}, ${value.expression});`)
    lines.push(emitRuntimeTypeCheck('inox::thrown()', context))
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

  if (expression === null || typeof expression === 'undefined') {
    return []
  }

  if (expression.type !== 'ArrayLiteral') {
    pushDiagnostic(
      context,
      diagnostic(
        'INOX_C_COLLECTION',
        'C Set constructor currently supports only array literal values or Set copy sources',
        nodeLocOrFallback(expression, loc)
      )
    )
    return []
  }

  const lines: string[] = []

  for (const element of expression.elements) {
    const value = deps.emitCValueExpression(element, context)
    reportCCollectionHashability(
      deps.inferExpressionType(element, context),
      'Set values',
      nodeLocOrFallback(element, loc),
      context
    )

    pushAllLines(lines, value.lines)
    lines.push(`${emitCIdentifier(name)}.add(${value.expression});`)
    lines.push(emitRuntimeTypeCheck('inox::thrown()', context))
  }

  return lines
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
  const promiseConstructor = deps.emitPreparedPromiseConstructorExpression(
    statement.init,
    context,
    preparedCallOut(statement.name)
  )

  if (promiseConstructor !== null && typeof promiseConstructor !== 'undefined') {
    registerPromiseVariableMetadata(statement, promiseConstructor, context)
    return {
      lines: promiseConstructor.lines,
      expression: ''
    }
  }

  const promise = deps.emitPreparedPromiseStaticExpression(statement.init, context, preparedCallOut(statement.name))

  if (promise !== null && typeof promise !== 'undefined') {
    registerPromiseVariableMetadata(statement, promise, context)
    return {
      lines: promise.lines,
      expression: ''
    }
  }

  const promiseCall = deps.emitPreparedPromiseReturningCallExpression(
    statement.init,
    context,
    preparedCallOut(statement.name)
  )

  if (promiseCall !== null && typeof promiseCall !== 'undefined') {
    registerPromiseVariableMetadata(statement, promiseCall, context)
    return {
      lines: promiseCall.lines,
      expression: ''
    }
  }

  if (statement.init.valueType === 'promise') {
    const classMethodCall = deps.emitPreparedClassMethodCallExpression(
      statement.init,
      context,
      preparedCallOut(statement.name)
    )

    if (classMethodCall !== null && typeof classMethodCall !== 'undefined') {
      registerPromiseVariableMetadata(statement, classMethodCall, context)
      return {
        lines: classMethodCall.lines,
        expression: ''
      }
    }
  }

  if (deps.isCollectionConstructorExpression(statement.init)) {
    return {
      lines: emitCollectionVariableDeclaration(statement, context),
      expression: ''
    }
  }

  const arrayFromCall = deps.emitPreparedArrayFromCallExpression(statement.init, context)

  if (arrayFromCall !== null && typeof arrayFromCall !== 'undefined') {
    return {
      lines: deps.emitArrayMapVariableDeclaration(statement, arrayFromCall, context),
      expression: ''
    }
  }

  const arrayMapCall = deps.emitPreparedArrayMapCallExpression(statement.init, context)

  if (arrayMapCall !== null && typeof arrayMapCall !== 'undefined') {
    return {
      lines: deps.emitArrayMapVariableDeclaration(statement, arrayMapCall, context),
      expression: ''
    }
  }

  const arrayFilterCall = deps.emitPreparedArrayFilterCallExpression(statement.init, context)

  if (arrayFilterCall !== null && typeof arrayFilterCall !== 'undefined') {
    return {
      lines: deps.emitArrayFilterVariableDeclaration(statement, arrayFilterCall, context),
      expression: ''
    }
  }

  const arraySliceCall = deps.emitPreparedArraySliceCallExpression(statement.init, context)

  if (arraySliceCall !== null && typeof arraySliceCall !== 'undefined') {
    return {
      lines: deps.emitArraySliceVariableDeclaration(statement, arraySliceCall, context),
      expression: ''
    }
  }

  const arraySortCall = deps.emitPreparedArraySortCallExpression(statement.init, context)

  if (arraySortCall !== null && typeof arraySortCall !== 'undefined') {
    return {
      lines: deps.emitArraySortVariableDeclaration(statement, arraySortCall, context),
      expression: ''
    }
  }

  const statementValueType = statement.valueType

  if (
    statement.nullable === true &&
    statementValueType !== null &&
    typeof statementValueType !== 'undefined' &&
    isRuntimeNullableType(statementValueType)
  ) {
    const lines = emitNullableRuntimeValueVariableDeclaration(statement, context)
    registerRuntimeValueMetadata(statement.name, statementValueType, statement, statement.init, context)

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
      lines: deps.emitObjectVariableDeclaration(statement, context),
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
        lines: deps.emitKnownObjectMemberVariableDeclaration(statement, member, context),
        expression: ''
      }
    }
  }

  if (deps.isIndexAccessExpression(statement.init)) {
    const element = deps.resolveKnownArrayIndex(statement.init, context)

    if (element !== null && typeof element !== 'undefined') {
      return {
        lines: deps.emitKnownArrayIndexVariableDeclaration(statement, element, context),
        expression: ''
      }
    }

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
        'this expression is not supported by the current C backend slice',
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

function registerPromiseVariableMetadata(
  statement: StatementNode,
  prepared: PreparedExpression,
  context: CFunctionContext
): void {
  if (
    statement.valueType !== 'promise' &&
    (statement.init === null || typeof statement.init === 'undefined' || statement.init.valueType !== 'promise')
  ) {
    return
  }

  context.variables.set(statement.name, 'promise')

  if (prepared.valueType !== null && typeof prepared.valueType !== 'undefined' && prepared.valueType !== 'unknown') {
    context.promiseValueTypes.set(statement.name, prepared.valueType)
  } else if (
    statement.promiseValueType !== null &&
    typeof statement.promiseValueType !== 'undefined' &&
    statement.promiseValueType !== 'unknown'
  ) {
    context.promiseValueTypes.set(statement.name, statement.promiseValueType)
  } else if (
    statement.init !== null &&
    typeof statement.init !== 'undefined' &&
    statement.init.promiseValueType !== null &&
    typeof statement.init.promiseValueType !== 'undefined' &&
    statement.init.promiseValueType !== 'unknown'
  ) {
    context.promiseValueTypes.set(statement.name, statement.init.promiseValueType)
  }

  if (
    prepared.rejectionValueType !== null &&
    typeof prepared.rejectionValueType !== 'undefined' &&
    prepared.rejectionValueType !== '' &&
    prepared.rejectionValueType !== 'unknown'
  ) {
    context.promiseRejectionValueTypes.set(statement.name, prepared.rejectionValueType)
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
  const setup: string[] = []
  let array: KnownForOfArray | null = statementDeps(context).resolveKnownForOfArray(statement.iterable, context)
  let runtimeArray: RuntimeForOfArray | null = null
  let runtimeMap: RuntimeForOfMap | null = null
  let runtimeMapEntries: RuntimeForOfMap | null = null
  let runtimeMapKeys: RuntimeForOfMapValues | null = null
  let runtimeMapValues: RuntimeForOfMapValues | null = null
  let runtimeSet: RuntimeForOfSet | null = null

  if (array === null || typeof array === 'undefined') {
    const iterable = statement.iterable

    if (iterable !== null && typeof iterable !== 'undefined' && iterable.type === 'ArrayLiteral') {
      const name = nextCName(context, 'inox_for_array')
      pushAllLines(
        setup,
        statementDeps(context).emitArrayVariableDeclaration(arrayVariableDeclarationNode(name, iterable), context)
      )
      array = statementDeps(context).resolveKnownForOfArray(referenceNode(name), context)
    }
  }

  if (array === null || typeof array === 'undefined') {
    runtimeArray = statementDeps(context).resolveRuntimeForOfArray(statement.iterable, context)
  }

  if (
    (array === null || typeof array === 'undefined') &&
    (runtimeArray === null || typeof runtimeArray === 'undefined')
  ) {
    runtimeMapEntries = resolveRuntimeForOfMapEntries(statement.iterable, context)
  }

  if (runtimeMapEntries !== null && typeof runtimeMapEntries !== 'undefined') {
    return emitRuntimeMapForOfStatement(statement, runtimeMapEntries, context)
  }

  if (
    (array === null || typeof array === 'undefined') &&
    (runtimeArray === null || typeof runtimeArray === 'undefined')
  ) {
    runtimeMapKeys = resolveRuntimeForOfMapKeys(statement.iterable, context)
  }

  if (runtimeMapKeys !== null && typeof runtimeMapKeys !== 'undefined') {
    return emitRuntimeMapValuesForOfStatement(statement, runtimeMapKeys, context)
  }

  if (
    (array === null || typeof array === 'undefined') &&
    (runtimeArray === null || typeof runtimeArray === 'undefined')
  ) {
    runtimeMapValues = statementDeps(context).resolveRuntimeForOfMapValues(statement.iterable, context)
  }

  if (runtimeMapValues !== null && typeof runtimeMapValues !== 'undefined') {
    return emitRuntimeMapValuesForOfStatement(statement, runtimeMapValues, context)
  }

  if (
    (array === null || typeof array === 'undefined') &&
    (runtimeArray === null || typeof runtimeArray === 'undefined')
  ) {
    runtimeMap = statementDeps(context).resolveRuntimeForOfMap(statement.iterable, context)
  }

  if (runtimeMap !== null && typeof runtimeMap !== 'undefined') {
    return emitRuntimeMapForOfStatement(statement, runtimeMap, context)
  }

  if (
    (array === null || typeof array === 'undefined') &&
    (runtimeArray === null || typeof runtimeArray === 'undefined')
  ) {
    runtimeSet = statementDeps(context).resolveRuntimeForOfSet(statement.iterable, context)
  }

  if (runtimeSet !== null && typeof runtimeSet !== 'undefined') {
    return emitRuntimeSetForOfStatement(statement, runtimeSet, context)
  }

  if (
    (array === null || typeof array === 'undefined') &&
    (runtimeArray === null || typeof runtimeArray === 'undefined')
  ) {
    pushDiagnostic(
      context,
      diagnostic('INOX_C_FOR_OF', 'C for-of currently supports arrays, Map values and Set values', statement.loc)
    )
    return []
  }

  let elementType = 'unknown'

  if (runtimeArray !== null && typeof runtimeArray !== 'undefined') {
    elementType = runtimeArray.elementType
  } else if (array !== null && typeof array !== 'undefined') {
    elementType = knownForOfArrayElementType(array, context)
  }

  if (!isCForOfArrayElementType(elementType)) {
    pushDiagnostic(
      context,
      diagnostic(
        'INOX_C_FOR_OF',
        'C for-of currently supports only uniform number/boolean/string arrays',
        statement.loc
      )
    )
    return []
  }

  const index = nextCName(context, 'inox_for_index')
  const value = nextCName(context, 'inox_for_value')
  let length = '0'
  let arrayName = ''

  if (runtimeArray !== null && typeof runtimeArray !== 'undefined') {
    length = nextCName(context, 'inox_for_length')
    arrayName = runtimeArray.name
  } else if (array !== null && typeof array !== 'undefined') {
    length = `${array.elements.length}`
    arrayName = array.name
  }

  const breakTarget: CLoopFlowTarget = { label: nextCName(context, 'inox_break'), throughFinally: false }
  const continueTarget: CLoopFlowTarget = { label: nextCName(context, 'inox_continue'), throughFinally: false }

  const variableScope = pushVariableScope(context)

  try {
    registerForOfElementMetadata(context, statement.name, elementType, statement)
    pushFlowTarget(context.breakTargets, breakTarget)
    pushFlowTarget(context.continueTargets, continueTarget)
    const body = emitScopedStatementBody(statement.body, context, [], [], [], [])
    popFlowTarget(context.continueTargets)
    popFlowTarget(context.breakTargets)
    const useRuntimeArrayValueBinding =
      runtimeArray !== null && typeof runtimeArray !== 'undefined' && shouldEmitRuntimeArrayValueBinding(elementType)
    const element = useRuntimeArrayValueBinding
      ? null
      : emitForOfElementDeclaration(statement.name, value, elementType, context)

    const arrayView = nextCName(context, 'inox_for_array_view')
    const lines: string[] = []
    pushAllLines(lines, setup)

    if (runtimeArray !== null && typeof runtimeArray !== 'undefined') {
      pushAllLines(lines, runtimeArray.lines)
      const rawArray = nextCName(context, 'inox_for_array')
      const failureStatement = statementDeps(context).emitFailureStatement(context)
      lines.push(`ArrayStorage* ${rawArray} = Array.raw(${arrayName});`)
      if (!context.cleanupEnabled && !context.statusReturn) {
        lines.push(`if (${rawArray} == nullptr) {`)
        lines.push('  inox::throw_value(inox::String("TypeError: value is not iterable"));')
        lines.push('  ' + failureStatement)
        lines.push('}')
      } else {
        lines.push(`if (${rawArray} == nullptr) ${failureStatement}`)
      }
      length = `${rawArray}->length`
      arrayName = rawArray
    } else {
      lines.push(`auto ${arrayView} = ArrayClass(${arrayName});`)
    }

    lines.push(`for (size_t ${index} = 0; ${index} < ${length}; ++${index}) {`)
    const hasContinueLabel = shouldEmitFlowTargetLabel(continueTarget)
    let loopBody = [`auto ${value} = ${arrayView}.get(${index});`, emitRuntimeTypeCheck('inox::thrown()', context)]
    if (useRuntimeArrayValueBinding) {
      loopBody = [`inox::Value ${emitCIdentifier(statement.name)} = ${arrayName}->items[${index}];`]
    } else if (runtimeArray !== null && typeof runtimeArray !== 'undefined') {
      loopBody = [`inox::Value ${value} = ${arrayName}->items[${index}];`]
    }
    if (element !== null) {
      pushAllLines(loopBody, element.lines)
      loopBody.push(element.expression)
    }
    pushAllLines(loopBody, body)
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

function knownForOfArrayElementType(array: KnownForOfArray, context: CFunctionContext): string {
  if (array.elements.length === 0) {
    const runtimeElementType = context.runtimeArrayElementTypes.get(array.name)

    if (runtimeElementType !== null && typeof runtimeElementType !== 'undefined') {
      return runtimeElementType
    }
  }

  return statementDeps(context).resolveForOfElementType(array.elements)
}

function emitRuntimeMapForOfStatement(
  statement: StatementNode,
  runtimeMap: RuntimeForOfMap,
  context: CFunctionContext
): string[] {
  const keyType = stringOrUnknown(runtimeMap.keyType)
  const valueType = stringOrUnknown(runtimeMap.valueType)

  if (!isCForOfValueType(keyType) || !isCForOfValueType(valueType)) {
    pushDiagnostic(
      context,
      diagnostic(
        'INOX_C_FOR_OF',
        'C for-of currently supports only Map entries with number/boolean/string or managed runtime keys and values',
        statement.loc
      )
    )
    return []
  }

  const index = nextCName(context, 'inox_for_map_index')
  const map = nextCName(context, 'inox_for_map')
  const breakTarget: CLoopFlowTarget = { label: nextCName(context, 'inox_break'), throughFinally: false }
  const continueTarget: CLoopFlowTarget = { label: nextCName(context, 'inox_continue'), throughFinally: false }
  const fields = [{ valueType: keyType }, { valueType }]

  registerOwnedValue(context, statement.name)

  const variableScope = pushVariableScope(context)

  try {
    context.variables.set(statement.name, 'array')
    context.arrayShapes.set(statement.name, fields)
    context.arrayLengths.set(statement.name, fields.length)
    pushFlowTarget(context.breakTargets, breakTarget)
    pushFlowTarget(context.continueTargets, continueTarget)
    const body = emitScopedStatementBody(statement.body, context, [], [], [], [])
    popFlowTarget(context.continueTargets)
    popFlowTarget(context.breakTargets)
    const entryName = emitCIdentifier(statement.name)

    const lines: string[] = []
    pushAllLines(lines, runtimeMap.lines)
    lines.push(`MapStorage* ${map} = ${runtimeMap.cppObject ? runtimeMap.name : `Map(${runtimeMap.name})`}.data();`)
    lines.push(emitRuntimeTypeCheck(`${map} == nullptr`, context))
    lines.push(`for (size_t ${index} = 0; ${index} < ${map}->capacity; ++${index}) {`)
    lines.push(`  if (${map}->entries[${index}].state != MapSlotOccupied) continue;`)
    const hasContinueLabel = shouldEmitFlowTargetLabel(continueTarget)
    const loopBody: string[] = []
    pushAllLines(loopBody, emitPrepareOwnedValueWrite(statement.name))
    loopBody.push(`${entryName} = ArrayClass::create(2);`)
    loopBody.push(emitRuntimeTypeCheck('inox::thrown()', context))
    loopBody.push(`ArrayClass(${entryName}).set(0, ${map}->entries[${index}].key);`)
    loopBody.push(emitRuntimeTypeCheck('inox::thrown()', context))
    loopBody.push(`ArrayClass(${entryName}).set(1, ${map}->entries[${index}].value);`)
    loopBody.push(emitRuntimeTypeCheck('inox::thrown()', context))
    pushAllLines(loopBody, body)
    pushLoopBodyLines(lines, loopBody, '  ', hasContinueLabel)
    if (hasContinueLabel) {
      pushAllLines(lines, emitContinueTargetLabel(continueTarget.label, context))
    }
    lines.push('}')
    if (shouldEmitFlowTargetLabel(breakTarget)) {
      pushAllLines(lines, emitBreakTargetLabel(breakTarget.label, context))
    }
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
    runtimeMapValues.useKey,
    runtimeMapValues.cppObject,
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
    false,
    runtimeSet.cppObject,
    context
  )
}

function emitRuntimeCollectionValueForOfStatement(
  statement: StatementNode,
  collectionName: string,
  elementType: string,
  setupLines: string[],
  collectionKind: string,
  useKey: boolean,
  cppObject: boolean,
  context: CFunctionContext
): string[] {
  const isMap = collectionKind === 'map'
  let unsupported = false
  let unsupportedMessage =
    'C for-of currently supports only uniform number/boolean/string or managed runtime Set values'

  if (isMap) {
    unsupportedMessage = 'C for-of currently supports only uniform number/boolean/string or managed runtime Map values'

    if (!isCForOfValueType(elementType)) {
      unsupported = true
    }
  } else if (!isCForOfValueType(elementType)) {
    unsupported = true
  }

  if (unsupported) {
    pushDiagnostic(context, diagnostic('INOX_C_FOR_OF', unsupportedMessage, statement.loc))
    return []
  }

  let indexPrefix = 'inox_for_set_index'
  let collectionPrefix = 'inox_for_set'
  let collectionType = 'SetStorage'
  let slotState = 'SetSlotOccupied'

  if (isMap) {
    indexPrefix = 'inox_for_map_index'
    collectionPrefix = 'inox_for_map'
    collectionType = 'MapStorage'
    slotState = 'MapSlotOccupied'
  }

  const index = nextCName(context, indexPrefix)
  const collection = nextCName(context, collectionPrefix)
  const value = nextCName(context, 'inox_for_value')
  const breakTarget: CLoopFlowTarget = { label: nextCName(context, 'inox_break'), throughFinally: false }
  const continueTarget: CLoopFlowTarget = { label: nextCName(context, 'inox_continue'), throughFinally: false }

  registerOwnedValue(context, value)

  const variableScope = pushVariableScope(context)

  try {
    registerForOfElementMetadata(context, statement.name, elementType, statement)
    pushFlowTarget(context.breakTargets, breakTarget)
    pushFlowTarget(context.continueTargets, continueTarget)
    const body = emitScopedStatementBody(statement.body, context, [], [], [], [])
    popFlowTarget(context.continueTargets)
    popFlowTarget(context.breakTargets)
    const element = emitForOfElementDeclaration(statement.name, value, elementType, context)

    const lines: string[] = []
    pushAllLines(lines, setupLines)
    const collectionData = cppObject
      ? `${collectionName}.data()`
      : isMap
        ? `Map(${collectionName}).data()`
        : `Set(${collectionName}).data()`
    lines.push(`${collectionType}* ${collection} = ${collectionData};`)
    lines.push(emitRuntimeTypeCheck(`${collection} == nullptr`, context))
    lines.push(`for (size_t ${index} = 0; ${index} < ${collection}->capacity; ++${index}) {`)
    lines.push(`  if (${collection}->entries[${index}].state != ${slotState}) continue;`)
    const loopBody: string[] = []
    pushAllLines(loopBody, emitPrepareOwnedValueWrite(value))
    if (isMap && useKey) {
      loopBody.push(`${value} = ${collection}->entries[${index}].key;`)
    } else {
      loopBody.push(`${value} = ${collection}->entries[${index}].value;`)
    }
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
    pushAllLines(lines, emitPrepareOwnedValueWrite(value))

    return lines
  } finally {
    restoreVariableScope(context, variableScope)
  }
}

export function emitSwitchStatement(statement: StatementNode, context: CFunctionContext): string[] {
  const discriminant = statementDeps(context).emitPreparedNumberExpression(statement.discriminant, context)
  const breakTarget: CLoopFlowTarget = { label: nextCName(context, 'inox_break'), throughFinally: false }
  const lines: string[] = []
  pushAllLines(lines, discriminant.lines)
  lines.push(`switch ((int)${discriminant.expression}) {`)

  for (const item of statement.cases) {
    if (item.test === null || typeof item.test === 'undefined') {
      lines.push('  default: {')
    } else {
      lines.push(`  case ${emitSwitchCaseLabel(item.test, context)}: {`)
    }

    pushFlowTarget(context.breakTargets, breakTarget)
    const body = emitScopedStatementList(item.consequent, context)
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
    return `(int)${expression.value}`
  }

  if (expression !== null && typeof expression !== 'undefined' && expression.type === 'BooleanLiteral') {
    if (expression.value) {
      return '(int)1'
    }

    return '(int)0'
  }

  if (expression !== null && typeof expression !== 'undefined' && expression.type === 'UnaryExpression') {
    const argument = expression.argument

    if (argument.type === 'NumberLiteral' && isSwitchCaseUnaryOperator(expression.operator)) {
      return `(int)(${expression.operator}${argument.value})`
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
        'nested async try/catch state-machine lowering is not supported by the current C backend slice',
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

  const tryBody = emitScopedStatementBody(statement.block, context, [], [], [], [])

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

    lines.push(`  } ${catchLabel}: {`)
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

    const finalizerBody = emitScopedStatementBody(statement.finalizer, context, [], [], [], [])

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
  const previousLineIndex = lines.length - 1

  if (previousLineIndex >= 0 && lines[previousLineIndex].trim() === '}') {
    lines[previousLineIndex] = `${lines[previousLineIndex]} ${endLabel}:;`
    return
  }

  lines.push(`${endLabel}:;`)
}

export function emitThrowStatement(statement: StatementNode, context: CFunctionContext): string[] {
  const target = currentErrorTarget(context)

  if ((target === null || typeof target === 'undefined') && !context.throwingFunction) {
    pushDiagnostic(
      context,
      diagnostic('INOX_C_THROW', 'uncaught throw is not supported by the current C backend slice', statement.loc)
    )
    return []
  }

  const isExceptionObject = isThrowableObjectExpression(statement.argument, context)

  if (statementDeps(context).inferExpressionType(statement.argument, context) !== 'string' && !isExceptionObject) {
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

    let typeCheck = `${errorValue}.tag != INOX_TAG_STRING || ${errorValue}.as.ref == 0`

    if (isExceptionObject) {
      typeCheck = runtimeObjectLikeValueMismatchCondition(errorValue)
    }

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

  let typeCheck = 'inox_error.tag != INOX_TAG_STRING || inox_error.as.ref == 0'

  if (isExceptionObject) {
    typeCheck = runtimeObjectLikeValueMismatchCondition('inox_error')
  }

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

function isThrowableObjectExpression(expression: StatementNode, context: CFunctionContext): boolean {
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

  if (context.returnType === 'promise') {
    return emitPromiseReturnStatement(returnStatement, context)
  }

  if (context.returnNullable === true && isNullableScalarType(context.returnType)) {
    return emitNullableScalarReturnStatement(returnStatement, context)
  }

  if (context.returnType === 'object' && libraryNativeCppType(context.returnShape) !== null) {
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

  pushAllLines(lines, value.lines)
  lines.push(`inox_return = ${value.expression};`)
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

  if (statement.init !== null && typeof statement.init !== 'undefined') {
    const arrayReduceCall = deps.emitPreparedArrayReduceCallExpression(statement.init, context)

    if (arrayReduceCall !== null && typeof arrayReduceCall !== 'undefined') {
      const lines: string[] = []

      context.variables.set(statement.name, 'number')
      pushAllLines(lines, arrayReduceCall.lines)
      lines.push(
        `${constPrefix(statement.kind === 'const')}double ${emitCIdentifier(statement.name)} = ${arrayReduceCall.expression};`
      )

      return lines
    }
  }

  if (statement.init === null || typeof statement.init === 'undefined') {
    return deps.emitScalarVariableDeclaration(statement, context)
  }

  const libraryObject = deps.emitPreparedCompilerLibraryCallExpression(
    statement.init,
    context,
    preparedCallOut(statement.name)
  )

  if (libraryObject !== null && statement.init.valueType === 'promise') {
    registerPromiseVariableMetadata(statement, libraryObject, context)
    return libraryObject.lines
  }

  if (libraryObject !== null && libraryObject.valueType === 'object') {
    if (deps.isExceptionValueExpression(statement.init, context)) {
      deps.registerExceptionValueShape(context, statement.name)
    }

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

  const asyncPromiseCall = deps.emitPreparedAsyncFunctionPromiseCallExpression(
    statement.init,
    context,
    preparedCallOut(statement.name)
  )

  if (asyncPromiseCall !== null && typeof asyncPromiseCall !== 'undefined') {
    registerPromiseVariableMetadata(statement, asyncPromiseCall, context)
    return asyncPromiseCall.lines
  }

  const promiseMethod = deps.emitPreparedPromiseMethodExpression(
    statement.init,
    context,
    preparedCallOut(statement.name)
  )

  if (promiseMethod !== null && typeof promiseMethod !== 'undefined') {
    registerPromiseVariableMetadata(statement, promiseMethod, context)
    return promiseMethod.lines
  }

  const promiseConstructor = deps.emitPreparedPromiseConstructorExpression(
    statement.init,
    context,
    preparedCallOut(statement.name)
  )

  if (promiseConstructor !== null && typeof promiseConstructor !== 'undefined') {
    registerPromiseVariableMetadata(statement, promiseConstructor, context)
    return promiseConstructor.lines
  }

  const promise = deps.emitPreparedPromiseStaticExpression(statement.init, context, preparedCallOut(statement.name))

  if (promise !== null && typeof promise !== 'undefined') {
    registerPromiseVariableMetadata(statement, promise, context)
    return promise.lines
  }

  const promiseCall = deps.emitPreparedPromiseReturningCallExpression(
    statement.init,
    context,
    preparedCallOut(statement.name)
  )

  if (promiseCall !== null && typeof promiseCall !== 'undefined') {
    registerPromiseVariableMetadata(statement, promiseCall, context)
    return promiseCall.lines
  }

  if (statement.init.valueType === 'promise') {
    const classMethodCall = deps.emitPreparedClassMethodCallExpression(
      statement.init,
      context,
      preparedCallOut(statement.name)
    )

    if (classMethodCall !== null && typeof classMethodCall !== 'undefined') {
      registerPromiseVariableMetadata(statement, classMethodCall, context)
      return classMethodCall.lines
    }
  }

  if (deps.isCollectionConstructorExpression(statement.init)) {
    return emitCollectionVariableDeclaration(statement, context)
  }

  const arrayFromCall = deps.emitPreparedArrayFromCallExpression(statement.init, context)

  if (arrayFromCall !== null && typeof arrayFromCall !== 'undefined') {
    return deps.emitArrayMapVariableDeclaration(statement, arrayFromCall, context)
  }

  const arrayMapCall = deps.emitPreparedArrayMapCallExpression(statement.init, context)

  if (arrayMapCall !== null && typeof arrayMapCall !== 'undefined') {
    return deps.emitArrayMapVariableDeclaration(statement, arrayMapCall, context)
  }

  const arrayFilterCall = deps.emitPreparedArrayFilterCallExpression(statement.init, context)

  if (arrayFilterCall !== null && typeof arrayFilterCall !== 'undefined') {
    return deps.emitArrayFilterVariableDeclaration(statement, arrayFilterCall, context)
  }

  const arraySliceCall = deps.emitPreparedArraySliceCallExpression(statement.init, context)

  if (arraySliceCall !== null && typeof arraySliceCall !== 'undefined') {
    return deps.emitArraySliceVariableDeclaration(statement, arraySliceCall, context)
  }

  const arraySortCall = deps.emitPreparedArraySortCallExpression(statement.init, context)

  if (arraySortCall !== null && typeof arraySortCall !== 'undefined') {
    return deps.emitArraySortVariableDeclaration(statement, arraySortCall, context)
  }

  const statementValueType = statement.valueType

  if (
    statement.nullable === true &&
    statementValueType !== null &&
    typeof statementValueType !== 'undefined' &&
    isRuntimeNullableType(statementValueType)
  ) {
    const lines = emitNullableRuntimeValueVariableDeclaration(statement, context)

    registerRuntimeValueMetadata(statement.name, statementValueType, statement, statement.init, context)

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

    return deps.emitObjectVariableDeclaration(statement, context)
  }

  if (
    statement.init !== null &&
    typeof statement.init !== 'undefined' &&
    (statement.init.type === 'ArrayLiteral' ||
      ((statement.valueType === 'array' ||
        (statement.arrayElementType !== null &&
          typeof statement.arrayElementType !== 'undefined' &&
          statement.arrayElementType !== 'unknown')) &&
        statement.init.elements !== null &&
        typeof statement.init.elements !== 'undefined'))
  ) {
    return deps.emitArrayVariableDeclaration(statement, context)
  }

  if (deps.isMemberAccessExpression(statement.init)) {
    const member = deps.resolveKnownObjectMember(statement.init, context)

    if (member !== null && typeof member !== 'undefined') {
      return deps.emitKnownObjectMemberVariableDeclaration(statement, member, context)
    }
  }

  if (deps.isIndexAccessExpression(statement.init)) {
    const element = deps.resolveKnownArrayIndex(statement.init, context)

    if (element !== null && typeof element !== 'undefined') {
      return deps.emitKnownArrayIndexVariableDeclaration(statement, element, context)
    }

    const field = deps.resolveKnownObjectIndex(statement.init, context)

    if (field !== null && typeof field !== 'undefined') {
      return deps.emitDynamicObjectMemberVariableDeclaration(statement, field, context)
    }
  }

  if (statement.valueType === 'string' && deps.isDynamicRuntimeValueExpression(statement.init, context)) {
    return emitRuntimeStringVariableDeclaration(statement, statement.init, context)
  }

  if (deps.isIndexAccessExpression(statement.init)) {
    const runtimeElement = deps.resolveRuntimeArrayIndex(statement.init, context)

    if (
      runtimeElement !== null &&
      typeof runtimeElement !== 'undefined' &&
      isRuntimeValueDeclarationValueType(runtimeElement.valueType)
    ) {
      const objectRuntimeIndexDeclaration = emitObjectRuntimeArrayIndexValueVariableDeclaration(statement, context)

      if (objectRuntimeIndexDeclaration !== null && typeof objectRuntimeIndexDeclaration !== 'undefined') {
        return objectRuntimeIndexDeclaration
      }

      return emitRuntimeValueVariableDeclaration(statement, statement.init, context, runtimeElement.valueType)
    }
  }

  if (
    statement.init.type === 'CallExpression' &&
    ((statement.init.objectRuntimeMethod !== null && typeof statement.init.objectRuntimeMethod !== 'undefined') ||
      deps.isObjectRuntimeCallExpression(statement.init))
  ) {
    const objectRuntimeCallDeclaration = emitObjectRuntimeCallValueVariableDeclaration(statement, context)

    if (objectRuntimeCallDeclaration !== null && typeof objectRuntimeCallDeclaration !== 'undefined') {
      return objectRuntimeCallDeclaration
    }

    return emitRuntimeValueVariableDeclaration(statement, statement.init, context, 'array')
  }

  if (statement.init.type === 'AwaitExpression') {
    const awaitValueDeclaration = deps.emitAwaitValueVariableDeclaration(statement, context)

    if (awaitValueDeclaration !== null && typeof awaitValueDeclaration !== 'undefined') {
      return awaitValueDeclaration
    }
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

  if (!isRuntimeValueDeclarationValueType(targetType)) {
    return null
  }

  const deps = statementDeps(context)
  const value = deps.emitCValueExpression(expression.value, context)
  const expectedTag = cRuntimeValueTag(targetType)
  const lines: string[] = []

  pushAllLines(lines, value.lines)

  const targetCppType = context.cppValueTypes.get(target)

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

  if (targetType === 'array') {
    updateRuntimeArrayAssignmentMetadata(target, expression.value, context)
  }

  return lines
}

function updateRuntimeArrayAssignmentMetadata(target: string, value: StatementNode, context: CFunctionContext): void {
  context.arrayLengths.delete(target)
  context.arrayShapes.delete(target)
  context.runtimeArrayElementTypes.set(target, resolveRuntimeArrayAssignmentElementType(target, value, context))
}

function resolveRuntimeArrayAssignmentElementType(
  target: string,
  value: StatementNode,
  context: CFunctionContext
): string {
  const elementType = resolveRuntimeArrayElementType(value, context)

  if (elementType !== null && typeof elementType !== 'undefined') {
    return elementType
  }

  const current = context.runtimeArrayElementTypes.get(target)

  if (current !== null && typeof current !== 'undefined') {
    return current
  }

  return 'unknown'
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
    isOpaqueRuntimeValueType(valueType) ||
    valueType === 'bytes' ||
    valueType === 'object' ||
    valueType === 'array' ||
    valueType === 'map' ||
    valueType === 'set'
  )
}

export function emitExpressionStatement(statement: StatementNode, context: CFunctionContext): string[] {
  const deps = statementDeps(context)
  const expression: StatementNode = statement.expression

  if (expression.type === 'Reference') {
    return []
  }

  const promiseSettlement = deps.emitPromiseConstructorSettlementCall(expression, context)

  if (promiseSettlement !== null && typeof promiseSettlement !== 'undefined') {
    return promiseSettlement
  }

  if (expression.type === 'CallExpression') {
    const arrayPopCall = deps.emitPreparedArrayPopCallExpression(expression, context, preparedCallDiscard())

    if (arrayPopCall !== null && typeof arrayPopCall !== 'undefined') {
      return arrayPopCall.lines
    }

    const arrayPushCall = deps.emitPreparedArrayPushCallExpression(expression, context)

    if (arrayPushCall !== null && typeof arrayPushCall !== 'undefined') {
      return arrayPushCall.lines
    }

    const arrayUnshiftCall = deps.emitPreparedArrayUnshiftCallExpression(expression, context)

    if (arrayUnshiftCall !== null && typeof arrayUnshiftCall !== 'undefined') {
      return arrayUnshiftCall.lines
    }

    const arrayMapCall = deps.emitPreparedArrayMapCallExpression(expression, context)

    if (arrayMapCall !== null && typeof arrayMapCall !== 'undefined') {
      return arrayMapCall.lines
    }

    const arrayFilterCall = deps.emitPreparedArrayFilterCallExpression(expression, context)

    if (arrayFilterCall !== null && typeof arrayFilterCall !== 'undefined') {
      return arrayFilterCall.lines
    }

    const arraySliceCall = deps.emitPreparedArraySliceCallExpression(expression, context)

    if (arraySliceCall !== null && typeof arraySliceCall !== 'undefined') {
      return arraySliceCall.lines
    }

    const arraySortCall = deps.emitPreparedArraySortCallExpression(expression, context)

    if (arraySortCall !== null && typeof arraySortCall !== 'undefined') {
      return arraySortCall.lines
    }

    const classMethodCall = deps.emitPreparedClassMethodCallExpression(expression, context, {})

    if (classMethodCall !== null && typeof classMethodCall !== 'undefined') {
      if (classMethodCall.expression === '') {
        return classMethodCall.lines
      }

      const lines: string[] = []
      pushAllLines(lines, classMethodCall.lines)
      lines.push(`${classMethodCall.expression};`)
      return lines
    }

    if (deps.isArrayMethodCall(expression)) {
      pushDiagnostic(
        context,
        diagnostic(
          'INOX_C_ARRAY_METHOD',
          'array methods are not supported by the current C backend slice',
          statement.loc
        )
      )
      return []
    }

    const collectionCall = deps.emitPreparedCollectionCallExpression(expression, context)

    if (collectionCall !== null && typeof collectionCall !== 'undefined') {
      return collectionCall.lines
    }

    const promise = deps.emitPreparedPromiseStaticExpression(expression, context)

    if (promise !== null && typeof promise !== 'undefined') {
      return promise.lines
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

    const lines: string[] = []
    pushAllLines(lines, value.lines)
    lines.push(`${value.expression};`)
    return lines
  }

  if (expression.type === 'AssignmentExpression') {
    const moduleValueAssignment = emitModuleValueAssignmentExpression(expression, context, deps)

    if (moduleValueAssignment !== null && typeof moduleValueAssignment !== 'undefined') {
      return moduleValueAssignment
    }

    const mapIndexAssignment = deps.emitPreparedMapIndexAssignment(expression, context)

    if (mapIndexAssignment !== null && typeof mapIndexAssignment !== 'undefined') {
      return mapIndexAssignment.lines
    }

    const libraryAssignment = deps.emitPreparedCompilerLibraryCallExpression(expression, context)

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
      const element = deps.resolveKnownArrayIndex(expression.target, context)

      if (element !== null && typeof element !== 'undefined') {
        return deps.emitKnownArrayIndexAssignment(expression, element, context)
      }

      const runtimeArrayAssignment = emitRuntimeArrayIndexAssignment(expression, context)

      if (runtimeArrayAssignment !== null && typeof runtimeArrayAssignment !== 'undefined') {
        return runtimeArrayAssignment
      }

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
  const prefix = `${assignment}inox::await_value<`
  const lines: string[] = []

  for (const line of value.lines) {
    if (line.startsWith(prefix)) {
      lines.push(line.slice(assignment.length))
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
      nullable: expression.target.nullable,
      shape: expression.target.shape,
      functionType: expression.target.functionType,
      arrayElementType: expression.target.arrayElementType,
      arrayElementDeclaredType: expression.target.arrayElementDeclaredType,
      mapKeyType: expression.target.mapKeyType,
      mapValueType: expression.target.mapValueType,
      promiseValueType: expression.target.promiseValueType,
      setElementType: expression.target.setElementType,
      loc: expression.loc
    },
    context
  )
}

function emitRuntimeArrayIndexAssignment(expression: StatementNode, context: CFunctionContext): string[] | null {
  if (expression.type !== 'AssignmentExpression' || expression.target.type !== 'IndexExpression') {
    return null
  }

  const deps = statementDeps(context)
  const element = deps.resolveRuntimeArrayIndex(expression.target, context)

  if (element === null || typeof element === 'undefined') {
    return null
  }

  if (expression.target.object.type !== 'Reference' || expression.target.object.path.length !== 1) {
    return null
  }

  const path: string[] = expression.target.object.path
  const arrayName = path[0]
  const index = emitRuntimeArrayIndexExpression(element, context)
  const value = deps.emitCValueExpression(expression.value, context)
  const lines: string[] = []

  pushAllLines(lines, index.lines)
  pushAllLines(lines, value.lines)
  lines.push(`ArrayClass(${arrayName}).set(${index.expression}, ${value.expression});`)
  lines.push(emitRuntimeTypeCheck('inox::thrown()', context))

  return lines
}

function emitRuntimeArrayIndexExpression(element: CRuntimeArrayElement, context: CFunctionContext): PreparedExpression {
  const indexExpression = element.indexExpression

  if (indexExpression === null || typeof indexExpression === 'undefined') {
    return {
      lines: [],
      expression: `${element.index}`
    }
  }

  const index = statementDeps(context).emitPreparedNumberExpression(indexExpression, context)

  return {
    lines: index.lines,
    expression: `(size_t)(${index.expression})`
  }
}

function shouldNormalizeCAsyncReturnArgument(argument: StatementNode, context: CFunctionContext): boolean {
  return (
    context.returnType !== 'promise' &&
    (argument.valueType === 'promise' || statementDeps(context).inferExpressionType(argument, context) === 'promise')
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

function emitPromiseReturnStatement(statement: StatementNode, context: CFunctionContext): string[] {
  const promise = statementDeps(context).emitPreparedPromiseExpression(
    statement.argument,
    context,
    preparedPromiseReturnOptions()
  )

  if (promise === null || typeof promise === 'undefined') {
    pushDiagnostic(
      context,
      diagnostic(
        'INOX_C_ASYNC',
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
  lines.push(emitRuntimeValueCheck(returnOut, expectedTag, context))
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
  const value = emitRuntimeReturnValueExpression(statement.argument, context, context.returnType, context.returnShape)

  const lines: string[] = []
  pushAllLines(lines, value.lines)
  pushRuntimeValueReturnAssignment(lines, 'inox_return', value, context)
  if (context.returnNullable === true) {
    pushAllLines(lines, emitRuntimeNullableValueCheck('inox_return', expectedTag, context))
  } else {
    lines.push(emitRuntimeValueCheck('inox_return', expectedTag, context))
  }
  lines.push('inox_retain(inox_return);')
  pushAllLines(lines, emitReturnJump(context))
  return lines
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
