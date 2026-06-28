import { diagnostic } from '../../diagnostics.ts'
import { emitCRegExpFlags } from '../../features/regexp/index.ts'
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
import { cStringLiteral } from '../identifiers.ts'
import { emitRuntimeNullableValueCheck, emitRuntimeValueCheck, emitRuntimeValueCheckLines } from '../runtime-values.ts'
import { cUnsupportedExpressionCode, cUnsupportedVariableDeclarationCode, containsAwaitExpression } from '../syntax.ts'
import type {
  CArrayElementInfo,
  CAsyncTaskWrapper,
  CCallbackWrapper,
  CClassInfo,
  CDgramMessageHandler,
  CFunctionParam,
  CFunctionPointerAdapter,
  CFunctionReturnMapType,
  CFunctionType,
  CHttpHandler,
  CKnownArrayElement,
  CKnownObjectField,
  CKnownObjectIndexField,
  CNetHandler,
  CObjectAccessorReturnPath,
  CObjectShape,
  CObjectShapeField,
  CPromiseChainWrapper,
  CPromiseConstructorHandler,
  CRuntimeArrayElement,
  CPreparedCallOptions as PreparedCallOptions,
  CPreparedExpression as PreparedExpression,
  CPreparedStatement as PreparedStatement
} from '../types.ts'
import {
  cRuntimeValueTag,
  isManagedRuntimeReturnType,
  isNullableScalarType,
  isOpaqueRuntimeValueType,
  isRuntimeNullableType
} from '../value-types.ts'
import type { ArrayLoweringDependencies, PreparedArrayExpression } from './arrays.ts'
import { emitPreparedArrayLengthExpression, resolveRuntimeArrayElementType } from './arrays.ts'
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
  byteKinds: CStringMap
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
  cryptoImportNames: CStringSet
  diagnostics: Diagnostic[]
  dgramBoundSockets: CStringSet
  dgramCreateSocketNames: CStringSet
  dgramImportNames: CStringSet
  dgramMessageHandlers: Map<string, CDgramMessageHandler>
  dgramMessageSockets: CStringSet
  dgramReuseAddrSockets: CStringSet
  errorChannelUsed: boolean
  errorObjectNames: CStringSet
  errorTargets: string[]
  eventLoopUsed: boolean
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
  httpCreateServerNames: CStringSet
  httpHandlers: Map<string, CHttpHandler>
  httpImportNames: CStringSet
  jsGlobalRoots: CStringSet
  localValueNames: CStringSet
  mapTypes: Map<string, CFunctionReturnMapType>
  moduleObjectShapes: Map<string, CObjectShapeField[]>
  moduleValueDeclarationScope: boolean
  moduleValueNames: CStringMap
  moduleValueTypes: CStringMap
  netConnectNames: CStringSet
  netCreateServerNames: CStringSet
  netHandlers: Map<string, CNetHandler>
  netImportNames: CStringSet
  netReadingSockets: CStringSet
  narrowedNullableScalars: CStringSet
  nextId: number
  nullableLoweringDependencies: NullableLoweringDependencies
  nullableVariables: CStringSet
  objectAccessorReturnPaths: CObjectAccessorReturnPathMap
  objectAliases: CStringMap
  objectDeclaredTypes: CStringMap
  objectShapes: Map<string, CObjectShapeField[]>
  ownedCryptoHashes: string[]
  ownedCryptoHmacs: string[]
  ownedPromises: string[]
  ownedValues: string[]
  processEntryPath: string | null
  processRuntime: boolean
  promiseChainArrowWrappers: Map<AnyNode, CPromiseChainWrapper>
  promiseChainWrappers: Map<string, CPromiseChainWrapper>
  promiseConstructorHandlers: Map<string, CPromiseConstructorHandler>
  promiseRejectionValueTypes: CStringMap
  promiseValueTypes: CStringMap
  regexpLiterals: Map<string, StatementNode>
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
  keyType: string
  lines: string[]
  name: string
  valueType: string
}

type RuntimeForOfMapValues = {
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
  emitJsonParseVariableDeclaration(statement: StatementNode, context: CFunctionContext): string[] | null
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
  emitNodeNetworkCallStatement(expression: StatementNode, context: CFunctionContext): string[] | null
  emitNodeNetworkVariableDeclaration(statement: StatementNode, context: CFunctionContext): string[] | null
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
  emitPreparedBytesIndexAssignment(expression: StatementNode, context: CFunctionContext): PreparedStatement | null
  emitPreparedCallExpression(expression: StatementNode, context: CFunctionContext): PreparedExpression
  emitPreparedChildProcessCallExpression(
    expression: StatementNode,
    context: CFunctionContext,
    options?: PreparedCallOptions
  ): PreparedExpression | null
  emitPreparedClassMethodCallExpression(
    expression: StatementNode,
    context: CFunctionContext,
    options?: PreparedCallOptions
  ): PreparedExpression | null
  emitPreparedCollectionCallExpression(expression: StatementNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedCryptoCallExpression(
    expression: StatementNode,
    context: CFunctionContext,
    options?: PreparedCallOptions
  ): PreparedExpression | null
  emitPreparedCryptoHashCallExpression(expression: StatementNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedCryptoHmacCallExpression(expression: StatementNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedCryptoNumberCallExpression(
    expression: StatementNode,
    context: CFunctionContext
  ): PreparedExpression | null
  emitPreparedDebugMemoryCallExpression(
    expression: StatementNode,
    context: CFunctionContext,
    options?: PreparedCallOptions
  ): PreparedExpression | null
  emitPreparedFetchCallExpression(
    expression: StatementNode,
    context: CFunctionContext,
    options?: PreparedCallOptions
  ): PreparedExpression | null
  emitPreparedFetchHeadersCallExpression(
    expression: StatementNode,
    context: CFunctionContext,
    options?: PreparedCallOptions
  ): PreparedExpression | null
  emitPreparedFsCallExpression(
    expression: StatementNode,
    context: CFunctionContext,
    options?: PreparedCallOptions
  ): PreparedExpression | null
  emitPreparedFsSyncStatementExpression(expression: StatementNode, context: CFunctionContext): PreparedStatement | null
  emitPreparedMapIndexAssignment(expression: StatementNode, context: CFunctionContext): PreparedExpression | null
  emitPreparedNumberExpression(expression: StatementNode, context: CFunctionContext): PreparedExpression
  emitPreparedRuntimeTruthinessExpression(
    expression: StatementNode,
    context: CFunctionContext
  ): PreparedExpression | null
  emitPreparedPathObjectCallExpression(
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
  emitPreparedTimerCallExpression(
    expression: StatementNode,
    context: CFunctionContext,
    options?: PreparedCallOptions
  ): PreparedExpression | null
  emitPreparedUpdateExpression(expression: StatementNode, context: CFunctionContext): PreparedExpression
  emitPreparedUrlObjectExpression(
    expression: StatementNode,
    context: CFunctionContext,
    options?: PreparedCallOptions
  ): PreparedExpression | null
  emitPreparedUrlSearchParamsObjectExpression(
    expression: StatementNode,
    context: CFunctionContext,
    options?: PreparedCallOptions
  ): PreparedExpression | null
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
  isObjectRuntimeCallExpression(expression: StatementNode): boolean
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
  resolveBytesExpressionKind(expression: StatementNode | null | undefined, context: CFunctionContext): string | null
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
  if (
    expression === null ||
    typeof expression === 'undefined' ||
    expression.type !== 'ArrowFunctionExpression'
  ) {
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
    const lines = emitStatementListItem(statement, context)
    pushAllLines(result, lines)

    applyNullableScalarEarlyReturnNarrowing(statement, context)
  }

  const output = result

  return output
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
  const breakLabel = nextCName(context, 'inox_break')
  const continueLabel = nextCName(context, 'inox_continue')
  pushFlowTarget(context.breakTargets, { label: breakLabel, throughFinally: false })
  pushFlowTarget(context.continueTargets, { label: continueLabel, throughFinally: false })
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
    const arrayNarrowing = resolveRuntimeArrayConditionNarrowing(statement.test)
    const objectNarrowing = resolveRuntimeObjectConditionNarrowing(statement.test)
    const typeNarrowing = resolveTypeofConditionNarrowing(statement.test)
    const breakLabel = nextCName(context, 'inox_break')
    const continueLabel = nextCName(context, 'inox_continue')
    pushFlowTarget(context.breakTargets, { label: breakLabel, throughFinally: false })
    pushFlowTarget(context.continueTargets, { label: continueLabel, throughFinally: false })
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
  const storage = registerRuntimeStringStorage(statement.name, context)
  const lines: string[] = []
  pushAllLines(lines, value.lines)
  pushAllLines(lines, emitPrepareOwnedValueWrite(storage))
  lines.push(`inox_retain(${value.expression});`)
  lines.push(`${storage} = ${value.expression};`)
  lines.push(emitRuntimeValueCheck(storage, 'INOX_TAG_STRING', context))
  lines.push(
    `${constPrefix(statement.kind === 'const')}inox_string* ${statement.name} = (inox_string*)${storage}.as.ref;`
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
    return [`${constPrefix(statement.kind === 'const')}inox_string* ${statement.name} = ${runtimeString};`]
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
    `${constPrefix(statement.kind === 'const')}char* ${statement.name} = ${deps.emitStringExpression(statement.init, context)};`
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

  if (
    runtimeElement !== null &&
    typeof runtimeElement !== 'undefined' &&
    runtimeElement.valueType === 'function'
  ) {
    return emitRuntimeArrayFunctionValueVariableDeclaration(statement, runtimeElement, context)
  }

  if (isRuntimeFunctionType(functionType) || (runtimeFunctionType !== null && typeof runtimeFunctionType !== 'undefined')) {
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
  pushAllLines(lines, emitPrepareOwnedValueWrite(statement.name))
  lines.push(`${statement.name} = ${value.expression};`)
  lines.push(emitRuntimeValueCheck(statement.name, 'INOX_TAG_FUNCTION', context))
  lines.push(`inox_retain(${statement.name});`)

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

  if (inferred === 'date') {
    const value = statementDeps(context).emitPreparedNumberExpression(statement.init, context)
    const lines: string[] = []

    context.variables.set(statement.name, 'date')
    pushAllLines(lines, value.lines)
    lines.push(`${constPrefix(statement.kind === 'const')}double ${statement.name} = ${value.expression};`)

    return lines
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
    return [`double ${statement.name} = 0;`]
  }

  let arrayLength: PreparedExpression | null = null

  if (statement.init.type === 'MemberExpression' && statement.init.property === 'length') {
    arrayLength = emitPreparedArrayLengthExpression(statement.init, context)
  }

  if (arrayLength !== null && typeof arrayLength !== 'undefined') {
    const lines: string[] = []
    const lengthExpression: string = arrayLength.expression
    const line: string = `${constPrefix(statement.kind === 'const')}double ${statement.name} = ${lengthExpression};`

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

  registerOwnedValue(context, statement.name)
  registerRuntimeValueMetadata(statement.name, valueType, statement, expression, context)

  const lines: string[] = []
  pushAllLines(lines, value.lines)
  pushAllLines(lines, emitPrepareOwnedValueWrite(statement.name))
  lines.push(`${statement.name} = ${value.expression};`)

  if (statement.nullable === true && isRuntimeNullableType(valueType)) {
    pushAllLines(lines, emitRuntimeNullableValueCheck(statement.name, expectedTag, context))
  } else {
    const valueCheck = emitRuntimeValueCheck(statement.name, expectedTag, context)

    if (valueCheck !== '') {
      lines.push(valueCheck)
    }
  }

  lines.push(`inox_retain(${statement.name});`)

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
  } else if (valueType === 'bytes') {
    const byteKind = statementDeps(context).resolveBytesExpressionKind(expression, context)

    if (byteKind !== null && typeof byteKind !== 'undefined') {
      context.byteKinds.set(name, byteKind)
    } else {
      context.byteKinds.delete(name)
    }
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

  if (expression !== null && typeof expression !== 'undefined') {
    const expressionType = knownDeclaredType(expression.declaredType)

    if (expressionType !== null && typeof expressionType !== 'undefined') {
      return expressionType
    }

    return anyNodeLikeObjectAccessDeclaredType(expression, context)
  }

  return null
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
    if (property.value === null || typeof property.value === 'undefined') {
      continue
    }

    fields.push(resolveRuntimeObjectLiteralShapeField(property, context))
  }

  return fields
}

function resolveRuntimeObjectLiteralShapeField(
  property: StatementNode,
  context: CFunctionContext
): CObjectShapeField {
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

  if (expression !== null && typeof expression !== 'undefined') {
    if (expression.fsDirents === true) {
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
  lines.push(`${statement.name} = inox_default_alloc(0, sizeof(double), _Alignof(double));`)
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
  let tag = 'INOX_TAG_OBJECT'

  if (valueType === 'string') {
    tag = 'INOX_TAG_STRING'
  }

  registerBoxedValue(context, statement.name, valueType)
  context.boxedVariables.add(statement.name)
  context.variables.set(statement.name, valueType)

  const lines: string[] = []
  pushAllLines(lines, value.lines)
  lines.push(`${statement.name} = inox_default_alloc(0, sizeof(inox_value), _Alignof(inox_value));`)
  lines.push(`if (${statement.name} == 0) ${deps.emitFailureStatement(context)}`)
  lines.push(`*${statement.name} = ${value.expression};`)
  lines.push(emitRuntimeTypeCheck(`(*${statement.name}).tag != ${tag} || (*${statement.name}).as.ref == 0`, context))
  lines.push(`inox_retain(*${statement.name});`)

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
    return [`double ${statement.name} = 0;`]
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

  registerOwnedValue(context, statement.name)

  if (collectionConstructor === 'Map') {
    const mapKeyType = stringOrUnknown(statement.mapKeyType)
    const mapValueType = stringOrUnknown(statement.mapValueType)
    context.variables.set(statement.name, 'map')
    context.mapTypes.set(statement.name, runtimeMapMetadata(mapKeyType, mapValueType))
    reportCCollectionHashability(statement.mapKeyType, 'Map keys', statement.loc, context)

    const copied = emitCollectionVariableCopyConstructor(statement, context)

    if (copied !== null && typeof copied !== 'undefined') {
      return copied
    }

    const lines: string[] = []
    pushAllLines(lines, emitPrepareOwnedValueWrite(statement.name))
    lines.push(emitStatusCheck(`inox_map_new(&inox_default_allocator, &${statement.name})`, context))

    pushAllLines(lines, emitMapConstructorEntries(statement.name, constructorArg, context, statement.init.loc))

    return lines
  }

  context.variables.set(statement.name, 'set')
  context.setElementTypes.set(statement.name, stringOrUnknown(statement.setElementType))
  reportCCollectionHashability(statement.setElementType, 'Set values', statement.loc, context)

  const copied = emitCollectionVariableCopyConstructor(statement, context)

  if (copied !== null && typeof copied !== 'undefined') {
    return copied
  }

  const lines: string[] = []
  pushAllLines(lines, emitPrepareOwnedValueWrite(statement.name))
  lines.push(emitStatusCheck(`inox_set_new(&inox_default_allocator, &${statement.name})`, context))

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

  pushAllLines(lines, emitPrepareOwnedValueWrite(statement.name))
  pushAllLines(lines, value.lines)
  lines.push(`${statement.name} = ${value.expression};`)
  lines.push(`inox_retain(${statement.name});`)

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
    lines.push(emitStatusCheck(`inox_map_set(${name}, ${key.expression}, ${value.expression})`, context))
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
    lines.push(emitStatusCheck(`inox_set_add(${name}, ${value.expression})`, context))
  }

  return lines
}

function emitDirentArrayIndexVariableDeclaration(statement: StatementNode, context: CFunctionContext): string[] | null {
  const expression = statement.init

  if (expression === null || typeof expression === 'undefined') {
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
  lines.push(emitStatusCheck(`inox_array_get(${array.expression}, ${index}, &${statement.name})`, context))
  lines.push(emitRuntimeValueCheck(statement.name, 'INOX_TAG_OBJECT', context))
  lines.push(`inox_retain(${statement.name});`)

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
  const fetchCall = deps.emitPreparedFetchCallExpression(statement.init, context, preparedCallOut(statement.name))

  if (fetchCall !== null && typeof fetchCall !== 'undefined') {
    registerPromiseVariableMetadata(statement, fetchCall, context)
    return {
      lines: fetchCall.lines,
      expression: ''
    }
  }

  const fsCall = deps.emitPreparedFsCallExpression(statement.init, context, preparedCallOut(statement.name))

  if (fsCall !== null && typeof fsCall !== 'undefined') {
    registerPromiseVariableMetadata(statement, fsCall, context)
    return {
      lines: fsCall.lines,
      expression: ''
    }
  }

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

  if (variableType === 'regexp' && statement.init.type === 'RegExpLiteral') {
    context.regexpLiterals.set(statement.name, statement.init)

    return {
      lines: [],
      expression: emitRegExpLiteralVariableInitializer(statement)
    }
  }

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

    if (isRuntimeFunctionType(functionType) || (runtimeFunctionType !== null && typeof runtimeFunctionType !== 'undefined')) {
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
      let constPrefix = ''

      if (statement.kind === 'const') {
        constPrefix = 'const '
      }

      return {
        lines: [],
        expression: `${constPrefix}inox_string* ${statement.name} = ${runtimeString}`
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
      expression: `${constPrefix}char* ${statement.name} = ${deps.emitStringExpression(statement.init, context)}`
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

function emitRegExpLiteralVariableDeclaration(statement: StatementNode, context: CFunctionContext): string[] | null {
  if (statement.init.type !== 'RegExpLiteral') {
    return null
  }

  context.variables.set(statement.name, 'regexp')
  context.regexpLiterals.set(statement.name, statement.init)

  return [`${emitRegExpLiteralVariableInitializer(statement)};`]
}

function emitRegExpLiteralVariableInitializer(statement: StatementNode): string {
  return `${constPrefix(statement.kind === 'const')}inox_regexp_literal ${statement.name} = { ${cStringLiteral(
    statement.init.pattern
  )}, ${emitCRegExpFlags(statement.init.flags)} }`
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

  const breakLabel = nextCName(context, 'inox_break')
  const continueLabel = nextCName(context, 'inox_continue')

  registerOwnedValue(context, value)

  const variableScope = pushVariableScope(context)

  try {
    registerForOfElementMetadata(context, statement.name, elementType, statement)
    pushFlowTarget(context.breakTargets, { label: breakLabel, throughFinally: false })
    pushFlowTarget(context.continueTargets, { label: continueLabel, throughFinally: false })
    const body = emitScopedStatementBody(statement.body, context, [], [], [], [])
    popFlowTarget(context.continueTargets)
    popFlowTarget(context.breakTargets)
    const element = emitForOfElementDeclaration(statement.name, value, elementType, context)

    const getElementStatus = emitStatusCheck(`inox_array_get(${arrayName}, ${index}, &${value})`, context)
    const lines: string[] = []
    pushAllLines(lines, setup)

    if (runtimeArray !== null && typeof runtimeArray !== 'undefined') {
      pushAllLines(lines, runtimeArray.lines)
      lines.push(`size_t ${length} = 0;`)
      lines.push(emitStatusCheck(`inox_array_len(${arrayName}, &${length})`, context))
    }

    lines.push(`for (size_t ${index} = 0; ${index} < ${length}; ${index} += 1) {`)
    pushIndentedLines(lines, emitPrepareOwnedValueWrite(value), '  ')
    lines.push(`  ${getElementStatus}`)
    pushIndentedLines(lines, element.lines, '  ')
    lines.push(`  ${element.expression}`)
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
  const breakLabel = nextCName(context, 'inox_break')
  const continueLabel = nextCName(context, 'inox_continue')
  const fields = [{ valueType: keyType }, { valueType }]

  registerOwnedValue(context, statement.name)

  const variableScope = pushVariableScope(context)

  try {
    context.variables.set(statement.name, 'array')
    context.arrayShapes.set(statement.name, fields)
    context.arrayLengths.set(statement.name, fields.length)
    pushFlowTarget(context.breakTargets, { label: breakLabel, throughFinally: false })
    pushFlowTarget(context.continueTargets, { label: continueLabel, throughFinally: false })
    const body = emitScopedStatementBody(statement.body, context, [], [], [], [])
    popFlowTarget(context.continueTargets)
    popFlowTarget(context.breakTargets)
    const createEntryStatus = emitStatusCheck(`inox_array_new(&inox_default_allocator, 2, &${statement.name})`, context)
    const initKeyStatus = emitStatusCheck(
      `inox_array_set(${statement.name}, 0, ${map}->entries[${index}].key)`,
      context
    )
    const initValueStatus = emitStatusCheck(
      `inox_array_set(${statement.name}, 1, ${map}->entries[${index}].value)`,
      context
    )

    const lines: string[] = []
    pushAllLines(lines, runtimeMap.lines)
    lines.push(`inox_map* ${map} = (inox_map*)${runtimeMap.name}.as.ref;`)
    lines.push(`for (size_t ${index} = 0; ${index} < ${map}->cap; ${index} += 1) {`)
    lines.push(`  if (${map}->entries[${index}].state != INOX_MAP_SLOT_OCCUPIED) continue;`)
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
    runtimeMapValues.useKey,
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
  let collectionType = 'inox_set'
  let slotState = 'INOX_SET_SLOT_OCCUPIED'

  if (isMap) {
    indexPrefix = 'inox_for_map_index'
    collectionPrefix = 'inox_for_map'
    collectionType = 'inox_map'
    slotState = 'INOX_MAP_SLOT_OCCUPIED'
  }

  const index = nextCName(context, indexPrefix)
  const collection = nextCName(context, collectionPrefix)
  const value = nextCName(context, 'inox_for_value')
  const breakLabel = nextCName(context, 'inox_break')
  const continueLabel = nextCName(context, 'inox_continue')

  registerOwnedValue(context, value)

  const variableScope = pushVariableScope(context)

  try {
    registerForOfElementMetadata(context, statement.name, elementType, statement)
    pushFlowTarget(context.breakTargets, { label: breakLabel, throughFinally: false })
    pushFlowTarget(context.continueTargets, { label: continueLabel, throughFinally: false })
    const body = emitScopedStatementBody(statement.body, context, [], [], [], [])
    popFlowTarget(context.continueTargets)
    popFlowTarget(context.breakTargets)
    const element = emitForOfElementDeclaration(statement.name, value, elementType, context)

    const lines: string[] = []
    pushAllLines(lines, setupLines)
    lines.push(`${collectionType}* ${collection} = (${collectionType}*)${collectionName}.as.ref;`)
    lines.push(`for (size_t ${index} = 0; ${index} < ${collection}->cap; ${index} += 1) {`)
    lines.push(`  if (${collection}->entries[${index}].state != ${slotState}) continue;`)
    pushIndentedLines(lines, emitPrepareOwnedValueWrite(value), '  ')
    if (isMap && useKey) {
      lines.push(`  ${value} = ${collection}->entries[${index}].key;`)
    } else {
      lines.push(`  ${value} = ${collection}->entries[${index}].value;`)
    }
    lines.push(`  inox_retain(${value});`)
    pushIndentedLines(lines, element.lines, '  ')
    lines.push(`  ${element.expression}`)
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
  const breakLabel = nextCName(context, 'inox_break')
  const lines: string[] = []
  pushAllLines(lines, discriminant.lines)
  lines.push(`switch ((int)${discriminant.expression}) {`)

  for (const item of statement.cases) {
    if (item.test === null || typeof item.test === 'undefined') {
      lines.push('  default: {')
    } else {
      lines.push(`  case ${emitSwitchCaseLabel(item.test, context)}: {`)
    }

    pushFlowTarget(context.breakTargets, { label: breakLabel, throughFinally: false })
    const body = emitScopedStatementList(item.consequent, context)
    popFlowTarget(context.breakTargets)
    pushIndentedLines(lines, body, '    ')
    lines.push('  }')
  }

  lines.push('}')
  pushAllLines(lines, emitBreakTargetLabel(breakLabel, context))

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

  registerErrorChannel(context)

  const id = nextCName(context, 'inox_try')
  let catchLabel: string | null = null
  let finallyLabel: string | null = null

  if (statement.handler !== null && typeof statement.handler !== 'undefined') {
    catchLabel = `${id}_catch`
  }

  if (statement.finalizer !== null && typeof statement.finalizer !== 'undefined') {
    finallyLabel = `${id}_finally`
  }

  const endLabel = `${id}_end`
  let throwTarget = catchLabel

  if (throwTarget === null || typeof throwTarget === 'undefined') {
    throwTarget = finallyLabel
  }

  const outerReturnTarget = currentReturnTarget(context)
  const outerBreakTarget = currentBreakTarget(context)
  const outerContinueTarget = currentContinueTarget(context)
  const lines = ['{']

  if (throwTarget !== null && typeof throwTarget !== 'undefined') {
    pushStringTarget(context.errorTargets, throwTarget)
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
    popStringTarget(context.errorTargets)
  }

  pushIndentedLines(lines, tryBody, '  ')
  if (finallyLabel !== null && typeof finallyLabel !== 'undefined') {
    lines.push(`  goto ${finallyLabel};`)
  } else {
    lines.push(`  goto ${endLabel};`)
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

    try {
      if (statement.handler.param !== null && typeof statement.handler.param !== 'undefined') {
        context.localValueNames.add(statement.handler.param)

        if (catchValueType === 'object') {
          context.variables.set(statement.handler.param, 'object')
          statementDeps(context).registerErrorObjectShape(context, statement.handler.param)
          catchBody.push(`inox_value ${statement.handler.param} = inox_error;`)
        } else if (catchValueType === 'string') {
          context.variables.set(statement.handler.param, 'string')
          context.runtimeStrings.add(statement.handler.param)
          catchBody.push(`inox_string* ${statement.handler.param} = (inox_string*)inox_error.as.ref;`)
        } else {
          context.variables.set(statement.handler.param, 'unknown')
          catchBody.push(`inox_value ${statement.handler.param} = inox_error;`)
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

    const catchFailureStatement: string = statementDeps(context).emitFailureStatement(context)

    lines.push(`${catchLabel}:`)
    lines.push(`  if (${emitCatchBindingTypeCheck(catchValueType)}) ${catchFailureStatement}`)
    lines.push('  inox_error_active = 0;')
    lines.push('  {')
    pushIndentedLines(lines, catchBody, '    ')
    lines.push('  }')
    lines.push('  inox_release(inox_error);')
    lines.push('  inox_error = inox_undefined_value();')
  }

  if (
    statement.finalizer !== null &&
    typeof statement.finalizer !== 'undefined' &&
    finallyLabel !== null &&
    typeof finallyLabel !== 'undefined'
  ) {
    const outerThrowTarget = currentErrorTarget(context)
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
      pushStringTarget(context.errorTargets, outerThrowTarget)
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
      popStringTarget(context.errorTargets)
    }

    lines.push(`${finallyLabel}:`)
    pushIndentedLines(lines, finalizerBody, '  ')

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
      lines.push(`  if (inox_break_active) goto ${outerBreakTarget.label};`)
    }

    if (context.continueFlowUsed && outerContinueTarget !== null && typeof outerContinueTarget !== 'undefined') {
      lines.push(`  if (inox_continue_active) goto ${outerContinueTarget.label};`)
    }
  }

  lines.push(`${endLabel}:`)
  lines.push('  ;')
  lines.push('}')

  return lines
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

  const isErrorObject = isThrowableObjectExpression(statement.argument, context)

  if (statementDeps(context).inferExpressionType(statement.argument, context) !== 'string' && !isErrorObject) {
    pushDiagnostic(
      context,
      diagnostic(
        'INOX_C_THROW',
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
  pushAllLines(lines, emitPrepareOwnedValueWrite('inox_error'))
  lines.push(`inox_error = ${value.expression};`)

  let typeCheck = 'inox_error.tag != INOX_TAG_STRING || inox_error.as.ref == 0'

  if (isErrorObject) {
    typeCheck = 'inox_error.tag != INOX_TAG_OBJECT || inox_error.as.ref == 0'
  }

  lines.push(emitRuntimeTypeCheck(typeCheck, context))
  lines.push('inox_retain(inox_error);')

  if (target === null || typeof target === 'undefined') {
    lines.push('inox_status_result = INOX_ERR_THROW;')
  }

  lines.push('inox_error_active = 1;')

  if (target !== null && typeof target !== 'undefined') {
    lines.push(`goto ${target};`)
  } else {
    lines.push('goto inox_cleanup;')
  }

  return lines
}

function isThrowableObjectExpression(expression: StatementNode, context: CFunctionContext): boolean {
  const deps = statementDeps(context)

  if (deps.isErrorValueExpression(expression, context)) {
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

export function emitVariableDeclarationStatement(statement: StatementNode, context: CFunctionContext): string[] {
  const deps = statementDeps(context)

  if (context.moduleValueDeclarationScope && context.moduleValueNames.has(statement.name)) {
    return deps.emitModuleValueVariableAssignment(statement, context)
  }

  context.localValueNames.add(statement.name)

  if (statement.init !== null && typeof statement.init !== 'undefined') {
    const arrayReduceCall = deps.emitPreparedArrayReduceCallExpression(statement.init, context)

    if (arrayReduceCall !== null && typeof arrayReduceCall !== 'undefined') {
      const lines: string[] = []

      context.variables.set(statement.name, 'number')
      pushAllLines(lines, arrayReduceCall.lines)
      lines.push(`${constPrefix(statement.kind === 'const')}double ${statement.name} = ${arrayReduceCall.expression};`)

      return lines
    }
  }

  const nodeNetworkDeclaration = deps.emitNodeNetworkVariableDeclaration(statement, context)

  if (nodeNetworkDeclaration !== null && typeof nodeNetworkDeclaration !== 'undefined') {
    return nodeNetworkDeclaration
  }

  const fetchAbortController = deps.emitFetchAbortControllerVariableDeclaration(statement, context)

  if (fetchAbortController !== null && typeof fetchAbortController !== 'undefined') {
    return fetchAbortController
  }

  if (statement.init === null || typeof statement.init === 'undefined') {
    return deps.emitScalarVariableDeclaration(statement, context)
  }

  const childProcessObject = deps.emitPreparedChildProcessCallExpression(
    statement.init,
    context,
    preparedCallOut(statement.name)
  )

  if (
    childProcessObject !== null &&
    typeof childProcessObject !== 'undefined' &&
    statement.init !== null &&
    typeof statement.init !== 'undefined' &&
    statement.init.childProcessRuntimeMethod === 'spawnSync'
  ) {
    return childProcessObject.lines
  }

  const pathObject = deps.emitPreparedPathObjectCallExpression(statement.init, context, preparedCallOut(statement.name))

  if (pathObject !== null && typeof pathObject !== 'undefined') {
    return pathObject.lines
  }

  const urlObject = deps.emitPreparedUrlObjectExpression(statement.init, context, preparedCallOut(statement.name))

  if (urlObject !== null && typeof urlObject !== 'undefined') {
    return urlObject.lines
  }

  const urlSearchParamsObject = deps.emitPreparedUrlSearchParamsObjectExpression(
    statement.init,
    context,
    preparedCallOut(statement.name)
  )

  if (urlSearchParamsObject !== null && typeof urlSearchParamsObject !== 'undefined') {
    return urlSearchParamsObject.lines
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

  const fetchCall = deps.emitPreparedFetchCallExpression(statement.init, context, preparedCallOut(statement.name))

  if (fetchCall !== null && typeof fetchCall !== 'undefined') {
    registerPromiseVariableMetadata(statement, fetchCall, context)
    return fetchCall.lines
  }

  const fsCall = deps.emitPreparedFsCallExpression(statement.init, context, preparedCallOut(statement.name))

  if (fsCall !== null && typeof fsCall !== 'undefined') {
    registerPromiseVariableMetadata(statement, fsCall, context)
    return fsCall.lines
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

  const regexpDeclaration = emitRegExpLiteralVariableDeclaration(statement, context)

  if (regexpDeclaration !== null && typeof regexpDeclaration !== 'undefined') {
    return regexpDeclaration
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

  const fetchHeadersCall = deps.emitPreparedFetchHeadersCallExpression(
    statement.init,
    context,
    preparedCallOut(statement.name)
  )

  if (fetchHeadersCall !== null && typeof fetchHeadersCall !== 'undefined' && statement.valueType === 'boolean') {
    context.variables.set(statement.name, 'boolean')
    return fetchHeadersCall.lines
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

  if (deps.isErrorConstructorExpression(statement.init)) {
    return deps.emitErrorObjectVariableDeclaration(statement, context)
  }

  if (deps.isClassConstructorExpression(statement.init, context)) {
    return deps.emitClassObjectVariableDeclaration(statement, context)
  }

  const jsonParseDeclaration = deps.emitJsonParseVariableDeclaration(statement, context)

  if (jsonParseDeclaration !== null && typeof jsonParseDeclaration !== 'undefined') {
    return jsonParseDeclaration
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
    const direntElement = emitDirentArrayIndexVariableDeclaration(statement, context)

    if (direntElement !== null && typeof direntElement !== 'undefined') {
      return direntElement
    }

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
      return emitRuntimeValueVariableDeclaration(statement, statement.init, context, runtimeElement.valueType)
    }
  }

  if (
    statement.init.type === 'CallExpression' &&
    ((statement.init.objectRuntimeMethod !== null && typeof statement.init.objectRuntimeMethod !== 'undefined') ||
      deps.isObjectRuntimeCallExpression(statement.init))
  ) {
    return emitRuntimeValueVariableDeclaration(statement, statement.init, context, 'array')
  }

  if (statement.init.type === 'AwaitExpression' && deps.inferExpressionType(statement.init, context) === 'string') {
    return emitRuntimeStringVariableDeclaration(statement, statement.init, context)
  }

  if (isRuntimeValueLocalExpression(statement.init, context)) {
    return emitRuntimeValueVariableDeclaration(statement, statement.init, context)
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
  lines.push(`inox_retain(${value.expression});`)
  pushAllLines(lines, emitPrepareOwnedValueWrite(storage))
  lines.push(`${storage} = ${value.expression};`)
  lines.push(`${target} = (inox_string*)${storage}.as.ref;`)

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

function emitRuntimeValueAssignment(expression: StatementNode, context: CFunctionContext): string[] | null {
  if (expression.target.type !== 'Reference' || expression.target.path.length !== 1) {
    return null
  }

  const path: string[] = expression.target.path
  const target = path[0]
  const targetType = context.variables.get(target)

  if (!isRuntimeValueDeclarationValueType(targetType)) {
    return null
  }

  const deps = statementDeps(context)
  const value = deps.emitCValueExpression(expression.value, context)
  const expectedTag = cRuntimeValueTag(targetType)
  const lines: string[] = []

  pushAllLines(lines, value.lines)

  const valueCheck = emitRuntimeValueCheck(value.expression, expectedTag, context)

  if (valueCheck !== '') {
    lines.push(valueCheck)
  }

  lines.push(`inox_retain(${value.expression});`)
  lines.push(`inox_release(${target});`)
  lines.push(`${target} = ${value.expression};`)

  if (targetType === 'bytes') {
    const byteKind = statementDeps(context).resolveBytesExpressionKind(expression.value, context)

    if (byteKind !== null && typeof byteKind !== 'undefined') {
      context.byteKinds.set(target, byteKind)
    } else {
      context.byteKinds.delete(target)
    }
  }

  if (targetType === 'array') {
    updateRuntimeArrayAssignmentMetadata(target, expression.value, context)
  }

  return lines
}

function updateRuntimeArrayAssignmentMetadata(
  target: string,
  value: StatementNode,
  context: CFunctionContext
): void {
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

  if (deps.isConsoleLog(expression)) {
    const callee = expression.callee
    const method: string = callee.property
    const args: StatementNode[] = expression.args
    const lines = deps.emitConsoleLogStatement(method, args, context)

    return lines
  }

  const promiseSettlement = deps.emitPromiseConstructorSettlementCall(expression, context)

  if (promiseSettlement !== null && typeof promiseSettlement !== 'undefined') {
    return promiseSettlement
  }

  if (expression.type === 'CallExpression') {
    const nodeNetworkCall = deps.emitNodeNetworkCallStatement(expression, context)

    if (nodeNetworkCall !== null && typeof nodeNetworkCall !== 'undefined') {
      return nodeNetworkCall
    }

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

    const fetchAbortCall = deps.emitFetchAbortControllerAbortStatement(expression, context)

    if (fetchAbortCall !== null && typeof fetchAbortCall !== 'undefined') {
      return fetchAbortCall
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

    const processExit = deps.emitProcessExitStatement(expression, context)

    if (processExit !== null && typeof processExit !== 'undefined') {
      return processExit
    }

    const collectionCall = deps.emitPreparedCollectionCallExpression(expression, context)

    if (collectionCall !== null && typeof collectionCall !== 'undefined') {
      return collectionCall.lines
    }

    const debugMemoryCall = deps.emitPreparedDebugMemoryCallExpression(expression, context, preparedCallDiscard())

    if (debugMemoryCall !== null && typeof debugMemoryCall !== 'undefined') {
      return debugMemoryCall.lines
    }

    const cryptoCall = deps.emitPreparedCryptoCallExpression(expression, context, preparedCallDiscard())

    if (cryptoCall !== null && typeof cryptoCall !== 'undefined') {
      return cryptoCall.lines
    }

    const cryptoNumberCall = deps.emitPreparedCryptoNumberCallExpression(expression, context)

    if (cryptoNumberCall !== null && typeof cryptoNumberCall !== 'undefined') {
      return cryptoNumberCall.lines
    }

    const fetchCall = deps.emitPreparedFetchCallExpression(expression, context)

    if (fetchCall !== null && typeof fetchCall !== 'undefined') {
      return fetchCall.lines
    }

    const fsCall = deps.emitPreparedFsCallExpression(expression, context)

    if (fsCall !== null && typeof fsCall !== 'undefined') {
      return fsCall.lines
    }

    const fsSyncCall = deps.emitPreparedFsSyncStatementExpression(expression, context)

    if (fsSyncCall !== null && typeof fsSyncCall !== 'undefined') {
      return fsSyncCall.lines
    }

    const timerCall = deps.emitPreparedTimerCallExpression(expression, context)

    if (timerCall !== null && typeof timerCall !== 'undefined') {
      return timerCall.lines
    }

    const cryptoHashCall = deps.emitPreparedCryptoHashCallExpression(expression, context)

    if (cryptoHashCall !== null && typeof cryptoHashCall !== 'undefined') {
      return cryptoHashCall.lines
    }

    const cryptoHmacCall = deps.emitPreparedCryptoHmacCallExpression(expression, context)

    if (cryptoHmacCall !== null && typeof cryptoHmacCall !== 'undefined') {
      return cryptoHmacCall.lines
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

    return value.lines
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

    const processExitCodeAssignment = deps.emitProcessExitCodeAssignment(expression, context)

    if (processExitCodeAssignment !== null && typeof processExitCodeAssignment !== 'undefined') {
      return processExitCodeAssignment
    }

    const mapIndexAssignment = deps.emitPreparedMapIndexAssignment(expression, context)

    if (mapIndexAssignment !== null && typeof mapIndexAssignment !== 'undefined') {
      return mapIndexAssignment.lines
    }

    const urlFieldAssignment = deps.emitUrlObjectFieldAssignment(expression, context)

    if (urlFieldAssignment !== null && typeof urlFieldAssignment !== 'undefined') {
      return urlFieldAssignment
    }

    if (expression.target.type === 'MemberExpression') {
      const member = deps.resolveKnownObjectMember(expression.target, context)

      if (member !== null && typeof member !== 'undefined') {
        return deps.emitKnownObjectMemberAssignment(expression, member, context)
      }
    }

    if (expression.target.type === 'IndexExpression') {
      const bytesIndexAssignment = deps.emitPreparedBytesIndexAssignment(expression, context)

      if (bytesIndexAssignment !== null && typeof bytesIndexAssignment !== 'undefined') {
        return bytesIndexAssignment.lines
      }

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
  lines.push(emitStatusCheck(`inox_array_set(${arrayName}, ${index.expression}, ${value.expression})`, context))

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
  lines.push(`${returnOut} = ${value.expression};`)
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
  lines.push(`inox_return = ${value.expression};`)
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
  lines.push(`inox_return = ${value.expression};`)
  pushAllLines(lines, emitRuntimeNullableValueCheck('inox_return', expectedTag, context))
  if (isManagedRuntimeReturnType(context.returnType)) {
    lines.push('inox_retain(inox_return);')
  }
  pushAllLines(lines, emitReturnJump(context))
  return lines
}

export function emitCatchBindingTypeCheck(valueType: string): string {
  if (valueType === 'object') {
    return 'inox_error.tag != INOX_TAG_OBJECT || inox_error.as.ref == 0'
  }

  if (valueType === 'unknown') {
    return '0'
  }

  return 'inox_error.tag != INOX_TAG_STRING || inox_error.as.ref == 0'
}

export function registerErrorChannel(context: CFunctionContext): void {
  context.errorChannelUsed = true
  registerOwnedValue(context, 'inox_error')
}

export function currentErrorTarget(context: CFunctionContext): string | null {
  return lastStringOrNull(context.errorTargets)
}

export function emitBreakJump(context: CFunctionContext): string[] {
  const target = currentBreakTarget(context)

  if (target === null || typeof target === 'undefined') {
    return ['break;']
  } else {
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

    return 'goto inox_cleanup;'
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
