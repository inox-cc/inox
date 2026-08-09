import { collectIrTopLevelNodeEntries } from '../../../ir.ts'
import { diagnostic } from '../../../diagnostics.ts'
import type { TypeRef } from '../../../extensions/types.ts'
import type { AnyNode, Diagnostic, IrProgram, SourceLocation, ValueType } from '../../../types.ts'
import { isCJsGlobalRoot } from '../globals.ts'
import { emitCFunctionName, emitCIdentifier, emitCObjectFunctionFieldName } from '../identifiers.ts'
import { runtimeObjectLikeValueMismatchCondition } from '../runtime-values.ts'
import type {
  CCallbackContextWrapper,
  CCallbackWrapper,
  CClassInfo,
  CCompilerLibrarySet,
  CFunctionPointerRuntimeAdapter,
  CFunctionParam,
  CFunctionType,
  CNamedCallbackWrapper,
  CObjectShape,
  CObjectShapeField,
  CPlainArrowCallbackWrapper,
  CAsyncResultChainWrapper,
  CAsyncResultConstructorHandler,
  CRuntimeArrowCallbackWrapper,
  CRuntimeArrowCapture,
  CRuntimeCallbackWrapper,
  CPreparedExpression as PreparedExpression
} from '../types.ts'
import { cTypeRefValue } from '../types.ts'
import {
  applyLibraryNativeValueAdapter,
  cFunctionTypeFromTypeRef,
  cIterableElementFunctionType,
  cRuntimeValueTag,
  compilerLibraryNativeRuntimeValueExpressionForId,
  compilerLibraryNativeRuntimeValueExpressionForTypeRef,
  compilerLibraryNativeRuntimeValueValidExpressionForTypeRef,
  compilerLibraryIntrinsicNativeCppType,
  compilerLibraryIntrinsicAsyncResultCValidExpression,
  emitCStringParamName,
  emitCReturnType,
  emitCType,
  isBoxedScalarParam,
  isManagedRuntimeReturnType,
  isNullableScalarType,
  isOpaqueRuntimeValueType,
  libraryNativeBoundaryCppType,
  libraryNativeValueAdapter,
  resolveCCompilerLibrarySet
} from '../value-types.ts'
import { isAsyncResultChainExpression, isAsyncResultConstructorExpression } from './async-results.ts'

type CallbackNode = AnyNode
type CallbackArrowWrapperMap = Map<AnyNode, CCallbackWrapper>
type CallbackBooleanMap = Map<string, boolean>
type CallbackFunctionParamMap = Map<string, CFunctionParam[]>
type CallbackFunctionTypeMap = Map<string, CFunctionType>
type CallbackMutableDeclarationSet = Set<AnyNode | null | undefined>
type CallbackObjectShapeMap = Map<string, CObjectShapeField[]>
type CallbackAsyncResultConstructorHandlerMap = Map<string, CAsyncResultConstructorHandler>
type CallbackStringMap = Map<string, string>
type CallbackStringSet = Set<string>
type CallbackWrapperMap = Map<string, CCallbackWrapper>
type RuntimeArrowCaptureMap = Map<string, CRuntimeArrowCapture>

const runtimeCallbackArgsName = 'inox_callback_args'
const runtimeCallbackArgCountName = 'inox_callback_arg_count'

export type FunctionPointerParamInfo = {
  functionType: CFunctionType | null
  name: string
  runtimeFunction: boolean
  seenTypes: string[]
}

export type ObjectFunctionPointerFieldInfo = FunctionPointerParamInfo & {
  path: string[]
}

type FunctionPointerRuntimeAdapterContext = {
  functionPointerRuntimeAdapterNames: Map<string, CFunctionPointerRuntimeAdapter>
  functionPointerRuntimeAdapters: CFunctionPointerRuntimeAdapter[]
}

export type RuntimeCallbackArgumentInfo = {
  functionType: CFunctionType
  index: number
}

export type ExternalEventLoopScanDependencies = {
  isExternalEventLoopCallExpression(expression: AnyNode | null | undefined): boolean
}

type CallbackEmitContext = {
  boxedMutableCaptureDeclarations: CallbackMutableDeclarationSet
  callbackArrowWrappers: CallbackArrowWrapperMap
  callbackWrappers: CallbackWrapperMap
  classInfos?: Map<string, CClassInfo>
  externalEventLoopFunctions: CallbackStringSet
  functionAsyncFlags: CallbackBooleanMap
  functionNames: CallbackStringMap
  functionParams: CallbackFunctionParamMap
  functionReturnNullables?: Map<string, boolean>
  functionReturnShapes?: Map<string, CObjectShape | null>
  functionReturnTypeRefs?: Map<string, object | null>
  functionReturnTypes: CallbackStringMap
  functionReturnAsyncResultValueTypes?: Map<string, string | null>
  jsGlobalRoots: CallbackStringSet
  libraries?: CCompilerLibrarySet
  moduleObjectShapes?: CallbackObjectShapeMap
  moduleValueNames?: CallbackStringMap
  runtimeFunctionParams: CallbackFunctionTypeMap
  throwingFunctions?: CallbackStringSet
}

type CallbackFunctionContext = CallbackEmitContext & {
  boxedVariables: CallbackStringSet
  cleanupEnabled: boolean
  cppValueTypes: CallbackStringMap
  eventLoopUsed: boolean
  explicitEventLoop: boolean
  externalEventLoop: boolean
  functionTypes: CallbackFunctionTypeMap
  localValueNames: CallbackStringSet
  nullableVariables?: CallbackStringSet
  objectShapes: CallbackObjectShapeMap
  asyncResultConstructorHandlers: CallbackAsyncResultConstructorHandlerMap
  returnShape?: CObjectShape | null
  runtimeCallbackCleanupLabel?: string
  runtimeCallbackReturnOut?: string
  runtimeCallbackReturnShape?: CObjectShape | null
  runtimeCallbackReturnType?: string
  runtimeCallbacks: CallbackStringSet
  runtimeStrings: CallbackStringSet
  statusReturn: boolean
  usedRuntimeCallbackCleanupGoto?: boolean
  variables: CallbackStringMap
}

type RuntimeFunctionArgumentContext = {
  runtimeFunctionParams: CallbackFunctionTypeMap
}

function callbackStringOrNull(value: string | null | undefined): string | null {
  if (value !== null && typeof value !== 'undefined') {
    return value
  }

  return null
}

function callbackStringOrUnknown(value: string | null | undefined): string {
  if (value !== null && typeof value !== 'undefined') {
    return value
  }

  return 'unknown'
}

function callbackArrowFunctionType(expression: AnyNode | null | undefined): CFunctionType | null {
  if (expression === null || typeof expression === 'undefined' || expression.type !== 'ArrowFunctionExpression') {
    return null
  }

  const params: CFunctionParam[] = []
  let returnShape: CObjectShape | null = null
  let returnType = callbackStringOrNull(expression.returnType)

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
    returnType = callbackStringOrNull(expression.body.valueType)

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
    declaredReturnType: expression.declaredReturnType ?? null,
    kind: 'function',
    params,
    returnTypeRef: expression.returnTypeRef ?? null,
    returnNullable: expression.returnNullable === true,
    returnAsyncResultValueType: callbackStringOrNull(expression.returnAsyncResultValueType),
    returnShape,
    returnType: callbackStringOrUnknown(returnType)
  }
}

function callbackVariableFunctionType(statement: AnyNode): CFunctionType | null {
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

  return callbackArrowFunctionType(statement.init)
}

function syncCallbackVariableFunctionType(statement: AnyNode, functionType: CFunctionType | null): void {
  if (functionType === null || typeof functionType === 'undefined') {
    return
  }

  statement.functionType = functionType

  if (statement.init !== null && typeof statement.init !== 'undefined') {
    statement.init.functionType = functionType
  }
}

function callbackBooleanValueIsTrue(value: boolean | null | undefined): boolean {
  if (value === null || typeof value === 'undefined') {
    return false
  }

  if (value) {
    return true
  }

  return false
}

export type CallbackLoweringDependencies = {
  collectTemplatePlaceholderExpressions(expression: AnyNode): AnyNode[]
  createFunctionContext(
    baseContext: CallbackEmitContext,
    returnType: string,
    returnNullable: boolean
  ): CallbackFunctionContext
  emitBoxedValueCleanup(context: CallbackFunctionContext): string[]
  emitBoxedValueDeclarations(context: CallbackFunctionContext): string[]
  emitCleanupReturn(context: CallbackFunctionContext): string[]
  emitErrorChannelDeclarations(context: CallbackFunctionContext): string[]
  emitLoopFlowDeclarations(context: CallbackFunctionContext): string[]
  emitOwnedValueCleanup(context: CallbackFunctionContext): string[]
  emitOwnedValueDeclarations(context: CallbackFunctionContext): string[]
  emitPreparedNumberExpression(expression: AnyNode, context: CallbackFunctionContext): PreparedExpression
  emitReturnFlowDeclarations(context: CallbackFunctionContext): string[]
  emitReturnValueDeclarations(context: CallbackFunctionContext): string[]
  emitRuntimeCallbackRuntimeValueReturnLines(argument: AnyNode, context: CallbackFunctionContext): string[]
  emitStatementList(statements: AnyNode[], context: CallbackFunctionContext): string[]
  registerObjectShape(context: CallbackFunctionContext, name: string, shape: CObjectShape | null | undefined): void
  isExternalEventLoopCallExpression(expression: AnyNode | null | undefined): boolean
  runtimeCallbackArgumentInfoForCall(expression: AnyNode): RuntimeCallbackArgumentInfo | null
  shouldEmitCleanupLabel(context: CallbackFunctionContext): boolean
}

export type CallbackScopeBinding = {
  declaration?: AnyNode | CFunctionParam | null
  functionType?: CFunctionType | null
  loc?: AnyNode['loc']
  mutable?: boolean
  name: string
  nullable?: boolean
  asyncResultSettlementCExpression?: string | null
  asyncResultSettlementCppType?: string | null
  asyncResultSettlementKind?: 'reject' | 'fulfill' | null
  runtimeCallback?: boolean
  runtimeManaged?: boolean
  shape?: CObjectShape | null
  valueType: string
}

export type CallbackScope = Map<string, CallbackScopeBinding>

type PendingPlainFunctionArg = {
  arg: AnyNode
  callee: AnyNode
  functionType: CFunctionType
  index: number
  scopes: CallbackScope[]
  storageFunctionType: CFunctionType | null | undefined
}

type ExternalEventLoopScanState = {
  deps: ExternalEventLoopScanDependencies
  externalNames: Set<string>
  found: boolean
}

type RuntimeArrowCaptureScanState = {
  captures: RuntimeArrowCaptureMap
  context: CallbackEmitContext
  deps: CallbackLoweringDependencies
  localScopes: CallbackScope[]
  outerScopes: CallbackScope[]
}

type CallbackTopLevelNodeEntry = {
  kind: string
  node: CallbackNode
}

function callbackNodeArray(value: CallbackNode | CallbackNode[] | null | undefined): CallbackNode[] {
  if (Array.isArray(value)) {
    return value
  }

  return []
}

function callbackArrowParams(expression: AnyNode | null | undefined): CallbackNode[] {
  if (
    expression !== null &&
    typeof expression !== 'undefined' &&
    expression.params !== null &&
    typeof expression.params !== 'undefined' &&
    Array.isArray(expression.params)
  ) {
    return expression.params
  }

  return []
}

function seenTypesIncludeDeclaredType(seenTypes: string[], declaredType: string | null | undefined): boolean {
  if (declaredType === null || typeof declaredType === 'undefined') {
    return false
  }

  for (const seenType of seenTypes) {
    if (
      seenType === declaredType ||
      isContextDeclaredTypePair(seenType, declaredType) ||
      isDependencyCarrierContextPair(seenType, declaredType)
    ) {
      return true
    }
  }

  return false
}

function pushSeenDeclaredType(seenTypes: string[], declaredType: string | null | undefined): number {
  if (
    declaredType === null ||
    typeof declaredType === 'undefined' ||
    seenTypesIncludeDeclaredType(seenTypes, declaredType)
  ) {
    return 0
  }

  seenTypes.push(declaredType)

  if (declaredType === 'CEmitContext') {
    seenTypes.push('CFunctionContext')
    seenTypes.push('CDeclarationFunctionContext')
    return 3
  }

  if (declaredType === 'CFunctionContext') {
    seenTypes.push('CEmitContext')
    seenTypes.push('CDeclarationFunctionContext')
    return 3
  }

  if (declaredType === 'CDeclarationFunctionContext') {
    seenTypes.push('CEmitContext')
    seenTypes.push('CFunctionContext')
    return 3
  }

  return 1
}

function popSeenDeclaredTypes(seenTypes: string[], count: number): void {
  for (let index = 0; index < count; index = index + 1) {
    seenTypes.pop()
  }
}

function isContextDeclaredTypePair(left: string, right: string): boolean {
  return isContextDeclaredType(left) && isContextDeclaredType(right)
}

function isDependencyCarrierContextPair(left: string, right: string): boolean {
  return isDependencyCarrierDeclaredType(left) && isContextDeclaredType(right)
}

function isContextDeclaredType(value: string): boolean {
  return (
    value === 'CEmitContext' ||
    value === 'CFunctionContext' ||
    value === 'CDeclarationFunctionContext' ||
    value === 'CallbackEmitContext' ||
    value === 'CallbackFunctionContext' ||
    value === 'ClassFunctionContext' ||
    value === 'NullableFunctionContext' ||
    value === 'AsyncResultEmitContext' ||
    value === 'AsyncResultFunctionContext' ||
    value === 'StringCContext'
  )
}

function isDependencyCarrierDeclaredType(value: string): boolean {
  return (
    value === 'CModuleEmissionDependencies' ||
    value === 'CDeclarationEmissionDependencies' ||
    value === 'CallbackLoweringDependencies' ||
    value === 'ClassLoweringDependencies' ||
    value === 'NullableLoweringDependencies' ||
    value === 'AsyncResultChainLoweringDependencies' ||
    value === 'StatementLoweringDependencies' ||
    value === 'StringLoweringDependencies'
  )
}

function objectShapeDeclaredType(
  valueType: string | null | undefined,
  declaredType: string | null | undefined,
  shape: CObjectShape | null | undefined
): string | null {
  if (declaredType !== null && typeof declaredType !== 'undefined') {
    return declaredType
  }

  if (
    shape !== null &&
    typeof shape !== 'undefined' &&
    valueType !== null &&
    typeof valueType !== 'undefined' &&
    !isBuiltinObjectShapeValueType(valueType)
  ) {
    return valueType
  }

  return null
}

function isBuiltinObjectShapeValueType(valueType: string): boolean {
  return (
    valueType === 'boolean' ||
    valueType === 'bytes' ||
    valueType === 'function' ||
    valueType === 'number' ||
    valueType === 'object' ||
    valueType === 'async-result' ||
    valueType === 'string' ||
    valueType === 'unknown' ||
    valueType === 'void'
  )
}

function isPlainCallbackParamValueType(valueType: string): boolean {
  return valueType === 'number' || valueType === 'boolean'
}

function isPlainFunctionPointerParam(
  param: CFunctionParam,
  seen: CObjectShape[],
  seenTypes: string[],
  allowNullableScalar: boolean
): boolean {
  if (!allowNullableScalar && param.nullable === true && isNullableScalarType(param.valueType)) {
    return false
  }

  if (param.valueType === 'object') {
    const declaredType = objectShapeDeclaredType(param.valueType, param.declaredType, param.shape)

    if (seenTypesIncludeDeclaredType(seenTypes, declaredType)) {
      return true
    }

    const pushedTypes = pushSeenDeclaredType(seenTypes, declaredType)
    const supported = isSupportedPlainFunctionPointerShape(param.shape, seen, seenTypes)
    popSeenDeclaredTypes(seenTypes, pushedTypes)

    if (!supported) {
      return false
    }
  }

  return (
    param.valueType === 'number' ||
    param.valueType === 'boolean' ||
    param.valueType === 'unknown' ||
    isManagedRuntimeReturnType(param.valueType) ||
    isOpaqueRuntimeValueType(param.valueType)
  )
}

function isSupportedPlainFunctionPointerShape(
  shape: CObjectShape | null | undefined,
  seen: CObjectShape[],
  seenTypes: string[]
): boolean {
  if (shape === null || typeof shape === 'undefined' || shape.fields === null || typeof shape.fields === 'undefined') {
    return true
  }

  for (const item of seen) {
    if (item === shape) {
      return true
    }
  }

  seen.push(shape)

  for (const field of shape.fields) {
    if (field.valueType === 'function') {
      continue
    }

    if (field.valueType === 'object') {
      const declaredType = objectShapeDeclaredType(field.valueType, field.declaredType, field.shape)

      if (seenTypesIncludeDeclaredType(seenTypes, declaredType)) {
        continue
      }

      const pushedTypes = pushSeenDeclaredType(seenTypes, declaredType)
      const supported = isSupportedPlainFunctionPointerShape(field.shape, seen, seenTypes)
      popSeenDeclaredTypes(seenTypes, pushedTypes)

      if (!supported) {
        seen.pop()
        return false
      }
    }
  }

  seen.pop()

  return true
}

function isPlainFunctionPointerReturn(functionType: CFunctionType, allowNullableScalar: boolean): boolean {
  if (!allowNullableScalar && functionType.returnNullable === true && isNullableScalarType(functionType.returnType)) {
    return false
  }

  return (
    functionType.returnType === 'void' ||
    functionType.returnType === 'number' ||
    functionType.returnType === 'boolean' ||
    functionType.returnType === 'unknown' ||
    isManagedRuntimeReturnType(functionType.returnType) ||
    isOpaqueRuntimeValueType(functionType.returnType)
  )
}

function isManagedRuntimeCallbackParamValueType(valueType: string): boolean {
  return (
    valueType === 'string' ||
    valueType === 'object' ||
    valueType === 'bytes' ||
    valueType === 'function' ||
    valueType === 'unknown'
  )
}

function isSupportedRuntimeCallbackParamValueType(valueType: string): boolean {
  return (
    valueType === 'number' ||
    valueType === 'boolean' ||
    valueType === 'string' ||
    valueType === 'object' ||
    valueType === 'bytes' ||
    valueType === 'function' ||
    valueType === 'unknown'
  )
}

function isLibraryNativeRuntimeCallbackParam(param: CFunctionParam): boolean {
  return (
    libraryNativeBoundaryCppType(param.valueType, param.nullable === true, param.optional === true, param.shape) !==
    null
  )
}

function isSupportedRuntimeCallbackParam(param: CFunctionParam): boolean {
  return isSupportedRuntimeCallbackParamValueType(param.valueType) || isLibraryNativeRuntimeCallbackParam(param)
}

function isManagedRuntimeCallbackParam(param: CFunctionParam): boolean {
  return isManagedRuntimeCallbackParamValueType(param.valueType) || isLibraryNativeRuntimeCallbackParam(param)
}

function externalEventLoopNodeUses(
  node: AnyNode,
  externalNames: Set<string>,
  deps: ExternalEventLoopScanDependencies
): boolean {
  const state: ExternalEventLoopScanState = {
    deps: deps,
    externalNames: externalNames,
    found: false
  }

  visitExternalEventLoopNode(node, state)

  return state.found
}

function visitExternalEventLoopNode(
  value: AnyNode | AnyNode[] | null | undefined,
  state: ExternalEventLoopScanState
): void {
  if (state.found || value === null || typeof value === 'undefined') {
    return
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index = index + 1) {
      const item = value[index]

      visitExternalEventLoopNode(item, state)
    }
    return
  }

  if (state.deps.isExternalEventLoopCallExpression(value)) {
    state.found = true
    return
  }

  if (value.type === 'CallExpression') {
    const calleeName = callbackReferenceNameOrNull(value.callee)

    if (calleeName !== null && typeof calleeName !== 'undefined' && state.externalNames.has(calleeName)) {
      state.found = true
      return
    }
  }

  visitExternalEventLoopChildren(value, state)
}

function callbackReferenceNameOrNull(value: AnyNode | null | undefined): string | null {
  if (value === null || typeof value === 'undefined' || value.type !== 'Reference' || value.path.length !== 1) {
    return null
  }

  return value.path[0]
}

function visitExternalEventLoopChildren(current: AnyNode, state: ExternalEventLoopScanState): void {
  if (current.type === 'BlockStatement') {
    visitExternalEventLoopNode(current.body, state)
    return
  }

  if (current.type === 'ExpressionStatement') {
    visitExternalEventLoopNode(current.expression, state)
    return
  }

  if (current.type === 'VariableDeclaration') {
    visitExternalEventLoopNode(current.init, state)
    return
  }

  if (current.type === 'ReturnStatement' || current.type === 'ThrowStatement') {
    visitExternalEventLoopNode(current.argument, state)
    return
  }

  if (
    current.type === 'CallExpression' ||
    current.type === 'NewExpression' ||
    current.type === 'OptionalCallExpression'
  ) {
    visitExternalEventLoopNode(current.callee, state)
    visitExternalEventLoopNode(current.args, state)
    return
  }

  if (current.type === 'AssignmentExpression') {
    visitExternalEventLoopNode(current.target, state)
    visitExternalEventLoopNode(current.value, state)
    return
  }

  if (current.type === 'BinaryExpression') {
    visitExternalEventLoopNode(current.left, state)
    visitExternalEventLoopNode(current.right, state)
    return
  }

  if (current.type === 'AwaitExpression') {
    state.found = true
    return
  }

  if (current.type === 'UnaryExpression' || current.type === 'UpdateExpression') {
    visitExternalEventLoopNode(current.argument, state)
    return
  }

  if (current.type === 'MemberExpression' || current.type === 'OptionalMemberExpression') {
    visitExternalEventLoopNode(current.object, state)
    return
  }

  if (current.type === 'IndexExpression' || current.type === 'OptionalIndexExpression') {
    visitExternalEventLoopNode(current.object, state)
    visitExternalEventLoopNode(current.index, state)
    return
  }

  if (current.type === 'ArrayLiteral') {
    visitExternalEventLoopNode(current.elements, state)
    return
  }

  if (current.type === 'ObjectLiteral') {
    for (let index = 0; index < current.properties.length; index = index + 1) {
      const property = current.properties[index]

      visitExternalEventLoopNode(property.value, state)
    }
    return
  }

  if (current.type === 'TemplateLiteral') {
    visitExternalEventLoopNode(current.expressions, state)
    return
  }

  if (current.type === 'ArrowFunctionExpression') {
    visitExternalEventLoopNode(current.body, state)
    return
  }

  if (current.type === 'FunctionDeclaration') {
    visitExternalEventLoopNode(current.body, state)
    return
  }

  if (current.type === 'IfStatement') {
    visitExternalEventLoopNode(current.condition, state)
    visitExternalEventLoopNode(current.consequent, state)
    visitExternalEventLoopNode(current.alternate, state)
    return
  }

  if (current.type === 'WhileStatement') {
    visitExternalEventLoopNode(current.condition, state)
    visitExternalEventLoopNode(current.body, state)
    return
  }

  if (current.type === 'ForStatement') {
    visitExternalEventLoopNode(current.init, state)
    visitExternalEventLoopNode(current.test, state)
    visitExternalEventLoopNode(current.update, state)
    visitExternalEventLoopNode(current.body, state)
    return
  }

  if (current.type === 'ForOfStatement') {
    visitExternalEventLoopNode(current.iterable, state)
    visitExternalEventLoopNode(current.body, state)
    return
  }

  if (current.type === 'SwitchStatement') {
    visitExternalEventLoopNode(current.discriminant, state)

    for (let index = 0; index < current.cases.length; index = index + 1) {
      const item = current.cases[index]

      visitExternalEventLoopNode(item.test, state)
      visitExternalEventLoopNode(item.consequent, state)
    }
    return
  }

  if (current.type === 'TryStatement') {
    visitExternalEventLoopNode(current.block, state)

    if (current.handler !== null && typeof current.handler !== 'undefined') {
      visitExternalEventLoopNode(current.handler.body, state)
    }

    visitExternalEventLoopNode(current.finalizer, state)
  }
}

export function functionUsesExternalEventLoop(
  node: AnyNode,
  externalNames: Set<string>,
  deps: ExternalEventLoopScanDependencies
): boolean {
  return externalEventLoopNodeUses(node, externalNames, deps)
}

const genericFunctionType: CFunctionType = {
  kind: 'function',
  params: [],
  returnType: 'void'
}

export function normalizeFunctionType(functionType: CFunctionType | null | undefined): CFunctionType {
  if (functionType !== null && typeof functionType !== 'undefined') {
    return functionType
  }

  return genericFunctionType
}

export function isPlainFunctionPointerType(
  functionType: CFunctionType | null | undefined,
  seenTypes: string[] = []
): boolean {
  if (functionType === null || typeof functionType === 'undefined') {
    return true
  }

  const requiresObjectFunctionCompanions = functionTypeRequiresObjectFunctionCompanions(functionType, [], seenTypes)

  if (!isPlainFunctionPointerReturn(functionType, requiresObjectFunctionCompanions)) {
    return false
  }

  const seen: CObjectShape[] = []
  const traversalSeenTypes: string[] = []

  for (const seenType of seenTypes) {
    traversalSeenTypes.push(seenType)
  }

  for (let index = 0; index < functionType.params.length; index = index + 1) {
    const param = functionType.params[index]

    if (!isPlainFunctionPointerParam(param, seen, traversalSeenTypes, requiresObjectFunctionCompanions)) {
      return false
    }
  }

  return true
}

export function isPlainObjectFunctionField(_field: CObjectShapeField, _seenTypes: string[] = []): boolean {
  return false
}

export function isRuntimeObjectFunctionField(field: CObjectShapeField, _seenTypes: string[] = []): boolean {
  return isSupportedRuntimeCallbackType(field.functionType)
}

export function isRuntimeFunctionType(functionType: CFunctionType | null | undefined): boolean {
  if (functionType === null || typeof functionType === 'undefined') {
    return false
  }

  if (functionTypeRequiresObjectFunctionCompanions(functionType)) {
    return false
  }

  if (!isSupportedRuntimeCallbackReturnType(functionType.returnType)) {
    return false
  }

  let hasManagedParam = false

  for (let index = 0; index < functionType.params.length; index = index + 1) {
    const param = functionType.params[index]

    if (!isSupportedRuntimeCallbackParam(param)) {
      return false
    }

    if (isManagedRuntimeCallbackParam(param)) {
      hasManagedParam = true
    }
  }

  return hasManagedParam
}

export function isNullableFunctionType(
  valueType: string | null | undefined,
  nullable: boolean | null | undefined
): boolean {
  return valueType === 'function' && callbackBooleanValueIsTrue(nullable)
}

export function isSupportedRuntimeCallbackType(functionType: CFunctionType | null | undefined): boolean {
  const normalized = normalizeFunctionType(functionType)

  if (functionTypeRequiresObjectFunctionCompanions(normalized)) {
    return false
  }

  if (!isSupportedRuntimeCallbackReturnType(normalized.returnType)) {
    return false
  }

  for (let index = 0; index < normalized.params.length; index = index + 1) {
    const param = normalized.params[index]

    if (!isSupportedRuntimeCallbackParam(param)) {
      return false
    }
  }

  return true
}

function functionTypeRequiresObjectFunctionCompanions(
  functionType: CFunctionType | null | undefined,
  seen: CObjectShape[] = [],
  seenTypes: string[] = []
): boolean {
  if (functionType === null || typeof functionType === 'undefined') {
    return false
  }

  for (const param of functionType.params) {
    const paramSeenTypes: string[] = []

    for (const seenType of seenTypes) {
      paramSeenTypes.push(seenType)
    }

    if (param.valueType === 'unknown') {
      if (seenTypesIncludeDeclaredType(paramSeenTypes, param.declaredType)) {
        return true
      }

      continue
    }

    if (param.valueType !== 'object') {
      continue
    }

    if (seenTypesIncludeDeclaredType(paramSeenTypes, param.declaredType)) {
      if (
        param.declaredType !== null &&
        typeof param.declaredType !== 'undefined' &&
        isContextDeclaredType(param.declaredType)
      ) {
        return true
      }

      continue
    }

    const pushedTypes = pushSeenDeclaredType(paramSeenTypes, param.declaredType)
    const requiresCompanions = objectShapeRequiresFunctionCompanions(param.shape, seen, paramSeenTypes)

    popSeenDeclaredTypes(paramSeenTypes, pushedTypes)

    if (requiresCompanions) {
      return true
    }
  }

  return false
}

function objectShapeRequiresFunctionCompanions(
  _shape: CObjectShape | null | undefined,
  _seen: CObjectShape[],
  _seenTypes: string[]
): boolean {
  return false
}

export function isSupportedRuntimeCallbackReturnType(returnType: string | null | undefined): boolean {
  if (returnType === null || typeof returnType === 'undefined') {
    return false
  }

  return (
    returnType === 'void' ||
    returnType === 'number' ||
    returnType === 'boolean' ||
    returnType === 'string' ||
    returnType === 'async-result' ||
    isManagedRuntimeReturnType(returnType)
  )
}

function runtimeFunctionParamKey(functionName: string, index: number): string {
  return `${functionName}:${index}`
}

export function markRuntimeFunctionParam(
  callee: AnyNode | null | undefined,
  index: number,
  functionType: CFunctionType | null | undefined,
  context: CallbackEmitContext
): void {
  if (callee === null || typeof callee === 'undefined' || callee.type !== 'Reference') {
    return
  }

  if (callee.path.length !== 1) {
    return
  }

  const name = callee.path[0]

  if (!context.functionParams.has(name) || !isSupportedRuntimeCallbackType(functionType)) {
    return
  }

  context.runtimeFunctionParams.set(runtimeFunctionParamKey(name, index), normalizeFunctionType(functionType))
}

export function resolveFunctionParameterRuntimeType(
  functionName: string,
  index: number,
  param: CFunctionParam,
  context: CallbackEmitContext
): CFunctionType | null {
  const promoted = context.runtimeFunctionParams.get(runtimeFunctionParamKey(functionName, index))

  if (promoted !== null && typeof promoted !== 'undefined') {
    return promoted
  }

  if (isNullableFunctionType(param.valueType, param.nullable)) {
    return normalizeFunctionType(param.functionType)
  }

  if (isRuntimeFunctionType(param.functionType)) {
    return normalizeFunctionType(param.functionType)
  }

  return null
}

export function resolveRuntimeFunctionArgumentType(
  callee: AnyNode | null | undefined,
  index: number,
  param: CFunctionParam | null | undefined,
  context: RuntimeFunctionArgumentContext
): CFunctionType | null {
  if (param === null || typeof param === 'undefined' || param.valueType !== 'function') {
    return null
  }

  if (callee !== null && typeof callee !== 'undefined' && callee.type === 'Reference' && callee.path.length === 1) {
    const promoted = context.runtimeFunctionParams.get(runtimeFunctionParamKey(callee.path[0], index))

    if (promoted !== null && typeof promoted !== 'undefined') {
      return promoted
    }
  }

  if (isNullableFunctionType(param.valueType, param.nullable)) {
    return normalizeFunctionType(param.functionType)
  }

  if (isRuntimeFunctionType(param.functionType)) {
    return normalizeFunctionType(param.functionType)
  }

  return null
}

export function collectCallbackWrappers(
  irPrograms: IrProgram[],
  context: CallbackEmitContext,
  deps: CallbackLoweringDependencies
): CallbackWrapperMap {
  const wrappers: CallbackWrapperMap = new Map()
  const pendingPlainFunctionArgs: PendingPlainFunctionArg[] = []

  for (let irIndex = 0; irIndex < irPrograms.length; irIndex = irIndex + 1) {
    const ir = irPrograms[irIndex]
    const topLevelScope: CallbackScope = new Map()
    const entries = collectIrTopLevelNodeEntries(ir)

    for (let entryIndex = 0; entryIndex < entries.length; entryIndex = entryIndex + 1) {
      const item = entries[entryIndex]

      if (item.kind === 'function') {
        const scope: CallbackScope = new Map()
        declareCallbackParams(scope, item.node.params)
        const functionScopes: CallbackScope[] = [topLevelScope, scope]
        const returnFunctionType = cFunctionTypeFromTypeRef(
          item.node.returnTypeRef,
          resolveCCompilerLibrarySet(context.libraries),
          item.node.loc
        )

        syncReturnedCallbackFunctionTypes(item.node.body, returnFunctionType)

        for (let statementIndex = 0; statementIndex < item.node.body.length; statementIndex = statementIndex + 1) {
          const statement = item.node.body[statementIndex]

          visitCallbackStatement(statement, functionScopes, wrappers, pendingPlainFunctionArgs, context, deps)
        }
      } else if (item.kind === 'class') {
        visitCallbackClassMethods(item.node, topLevelScope, wrappers, pendingPlainFunctionArgs, context, deps)
      } else if (item.kind === 'statement') {
        visitCallbackStatement(item.node, [topLevelScope], wrappers, pendingPlainFunctionArgs, context, deps)
      }
    }
  }

  for (let pendingIndex = 0; pendingIndex < pendingPlainFunctionArgs.length; pendingIndex = pendingIndex + 1) {
    const pending = pendingPlainFunctionArgs[pendingIndex]
    if (
      !!resolveRuntimeFunctionArgumentType(
        pending.callee,
        pending.index,
        {
          name: '',
          valueType: 'function',
          functionType: pending.storageFunctionType
        },
        context
      )
    ) {
      registerRuntimeCallbackExpression(pending.arg, pending.functionType, pending.scopes, wrappers, context, deps)
    } else {
      registerPlainCallbackExpression(pending.arg, pending.functionType, pending.scopes, wrappers, context, deps)
    }
  }

  collectPlainFunctionValueWrappers(irPrograms, wrappers, context, deps)

  return wrappers
}

function visitCallbackClassMethods(
  classNode: CallbackNode,
  topLevelScope: CallbackScope,
  wrappers: CallbackWrapperMap,
  pendingPlainFunctionArgs: PendingPlainFunctionArg[],
  context: CallbackEmitContext,
  deps: CallbackLoweringDependencies
): void {
  const methods = callbackNodeArray(classNode.methods)

  for (let methodIndex = 0; methodIndex < methods.length; methodIndex = methodIndex + 1) {
    const method = methods[methodIndex]
    const scope: CallbackScope = new Map()
    declareCallbackParams(scope, callbackNodeArray(method.params))
    const methodScopes: CallbackScope[] = [topLevelScope, scope]
    const body = callbackNodeArray(method.body)
    const returnFunctionType = cFunctionTypeFromTypeRef(
      method.returnTypeRef,
      resolveCCompilerLibrarySet(context.libraries),
      callbackSourceLocation(method)
    )

    syncReturnedCallbackFunctionTypes(body, returnFunctionType)

    for (let statementIndex = 0; statementIndex < body.length; statementIndex = statementIndex + 1) {
      const statement = body[statementIndex]

      visitCallbackStatement(statement, methodScopes, wrappers, pendingPlainFunctionArgs, context, deps)
    }
  }
}

function syncReturnedCallbackFunctionTypes(statements: CallbackNode[], functionType: CFunctionType | null): void {
  if (functionType === null) {
    return
  }

  for (const statement of statements) {
    syncReturnedCallbackFunctionType(statement, functionType)
  }
}

function syncReturnedCallbackFunctionType(
  statement: CallbackNode | null | undefined,
  functionType: CFunctionType
): void {
  if (statement === null || typeof statement === 'undefined') {
    return
  }

  if (statement.type === 'ReturnStatement') {
    const argument = statement.argument

    if (argument !== null && typeof argument !== 'undefined') {
      argument.functionType = functionType
    }
    return
  }

  if (statement.type === 'BlockStatement') {
    syncReturnedCallbackFunctionTypes(statement.body, functionType)
    return
  }

  if (statement.type === 'IfStatement') {
    syncReturnedCallbackFunctionType(statement.consequent, functionType)
    syncReturnedCallbackFunctionType(statement.alternate, functionType)
    return
  }

  if (statement.type === 'WhileStatement' || statement.type === 'ForStatement' || statement.type === 'ForOfStatement') {
    syncReturnedCallbackFunctionType(statement.body, functionType)
    return
  }

  if (statement.type === 'SwitchStatement') {
    for (const item of statement.cases) {
      syncReturnedCallbackFunctionTypes(item.consequent, functionType)
    }
    return
  }

  if (statement.type === 'TryStatement') {
    syncReturnedCallbackFunctionType(statement.block, functionType)

    if (statement.handler !== null && typeof statement.handler !== 'undefined') {
      syncReturnedCallbackFunctionType(statement.handler.body, functionType)
    }

    syncReturnedCallbackFunctionType(statement.finalizer, functionType)
  }
}

function collectPlainFunctionValueWrappers(
  irPrograms: IrProgram[],
  wrappers: CallbackWrapperMap,
  context: CallbackEmitContext,
  deps: CallbackLoweringDependencies
): void {
  for (let irIndex = 0; irIndex < irPrograms.length; irIndex = irIndex + 1) {
    const ir = irPrograms[irIndex]
    const topLevelScope: CallbackScope = new Map()

    scanPlainFunctionValueStatements(ir.body, [topLevelScope], wrappers, context, deps)
  }
}

function scanPlainFunctionValueStatements(
  statements: CallbackNode[],
  scopes: CallbackScope[],
  wrappers: CallbackWrapperMap,
  context: CallbackEmitContext,
  deps: CallbackLoweringDependencies
): void {
  for (let index = 0; index < statements.length; index = index + 1) {
    const statement = statements[index]

    scanPlainFunctionValueStatement(statement, scopes, wrappers, context, deps)
  }
}

function scanPlainFunctionValueStatement(
  statement: CallbackNode | null | undefined,
  scopes: CallbackScope[],
  wrappers: CallbackWrapperMap,
  context: CallbackEmitContext,
  deps: CallbackLoweringDependencies
): void {
  if (statement === null || typeof statement === 'undefined') {
    return
  }

  if (statement.type === 'VariableDeclaration') {
    registerPlainFunctionValueVariable(statement, scopes, wrappers, context, deps)
    return
  }

  if (statement.type === 'BlockStatement') {
    scanPlainFunctionValueStatements(statement.body, appendCallbackScope(scopes, new Map()), wrappers, context, deps)
    return
  }

  if (statement.type === 'FunctionDeclaration') {
    const scope: CallbackScope = new Map()
    declareCallbackParams(scope, statement.params)
    scanPlainFunctionValueStatements(statement.body, appendCallbackScope(scopes, scope), wrappers, context, deps)
    return
  }

  if (statement.type === 'ClassDeclaration') {
    const methods = callbackNodeArray(statement.methods)

    for (let methodIndex = 0; methodIndex < methods.length; methodIndex = methodIndex + 1) {
      const method = methods[methodIndex]
      const scope: CallbackScope = new Map()
      declareCallbackParams(scope, callbackNodeArray(method.params))
      scanPlainFunctionValueStatements(
        callbackNodeArray(method.body),
        appendCallbackScope(scopes, scope),
        wrappers,
        context,
        deps
      )
    }
  }
}

function registerPlainFunctionValueVariable(
  statement: CallbackNode,
  scopes: CallbackScope[],
  wrappers: CallbackWrapperMap,
  context: CallbackEmitContext,
  deps: CallbackLoweringDependencies
): void {
  if (
    statement.init === null ||
    typeof statement.init === 'undefined' ||
    statement.init.type !== 'ArrowFunctionExpression' ||
    functionUsesExternalEventLoop(statement.init, context.externalEventLoopFunctions, deps) ||
    callbackNodeMayContainReference(statement.init.body)
  ) {
    return
  }

  const functionType = callbackVariableFunctionType(statement)

  syncCallbackVariableFunctionType(statement, functionType)
  registerPlainArrowCallbackWrapper(
    statement.init,
    normalizeFunctionType(functionType),
    scopes,
    wrappers,
    context,
    deps
  )
}

function callbackNodeMayContainReference(value: CallbackNode | CallbackNode[] | null | undefined): boolean {
  if (value === null || typeof value === 'undefined') {
    return false
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index = index + 1) {
      if (callbackNodeMayContainReference(value[index])) {
        return true
      }
    }

    return false
  }

  if (value.type === 'Reference') {
    return true
  }

  if (
    value.type === 'NumberLiteral' ||
    value.type === 'BooleanLiteral' ||
    value.type === 'StringLiteral' ||
    value.type === 'TemplateLiteral'
  ) {
    return false
  }

  if (value.type === 'BlockStatement') {
    return callbackNodeMayContainReference(value.body)
  }

  if (value.type === 'ExpressionStatement') {
    return callbackNodeMayContainReference(value.expression)
  }

  if (value.type === 'ReturnStatement' || value.type === 'ThrowStatement') {
    return callbackNodeMayContainReference(value.argument)
  }

  if (value.type === 'ArrowFunctionExpression') {
    return callbackNodeMayContainReference(value.body)
  }

  return true
}

function appendCallbackScope(scopes: CallbackScope[], scope: CallbackScope): CallbackScope[] {
  const result: CallbackScope[] = []

  for (let index = 0; index < scopes.length; index = index + 1) {
    const item = scopes[index]
    result.push(item)
  }

  result.push(scope)

  return result
}

function registerCallbackExpression(
  expression: AnyNode | null | undefined,
  functionType: CFunctionType | null | undefined,
  scopes: CallbackScope[],
  wrappers: CallbackWrapperMap,
  context: CallbackEmitContext,
  deps: CallbackLoweringDependencies,
  seenTypes: string[] = []
): void {
  if (expression !== null && typeof expression !== 'undefined' && expression.functionStorage === 'pointer') {
    registerPlainCallbackExpression(expression, functionType, scopes, wrappers, context, deps)
    return
  }

  if (expression !== null && typeof expression !== 'undefined' && expression.type === 'ArrowFunctionExpression') {
    registerArrowCallbackWrapper(expression, normalizeFunctionType(functionType), scopes, wrappers, context, deps)
    return
  }

  if (isPlainFunctionPointerType(functionType, seenTypes)) {
    return
  }

  if (!isRuntimeFunctionType(functionType)) {
    return
  }

  registerNamedCallbackWrapper(expression, normalizeFunctionType(functionType), wrappers, context)
}

function registerRuntimeCallbackExpression(
  expression: AnyNode | null | undefined,
  functionType: CFunctionType | null | undefined,
  scopes: CallbackScope[],
  wrappers: CallbackWrapperMap,
  context: CallbackEmitContext,
  deps: CallbackLoweringDependencies
): void {
  const normalized = normalizeFunctionType(functionType)

  if (!isSupportedRuntimeCallbackType(normalized)) {
    return
  }

  if (expression !== null && typeof expression !== 'undefined' && expression.type === 'ArrowFunctionExpression') {
    registerArrowCallbackWrapper(expression, normalized, scopes, wrappers, context, deps)
    return
  }

  registerNamedCallbackWrapper(expression, normalized, wrappers, context)
}

function registerPlainCallbackExpression(
  expression: AnyNode | null | undefined,
  functionType: CFunctionType | null | undefined,
  scopes: CallbackScope[],
  wrappers: CallbackWrapperMap,
  context: CallbackEmitContext,
  deps: CallbackLoweringDependencies
): void {
  if (expression !== null && typeof expression !== 'undefined' && expression.type === 'ArrowFunctionExpression') {
    registerPlainArrowCallbackWrapper(expression, normalizeFunctionType(functionType), scopes, wrappers, context, deps)
  }
}

function callbackExpressionHasCaptures(
  expression: AnyNode | null | undefined,
  scopes: CallbackScope[],
  context: CallbackEmitContext,
  deps: CallbackLoweringDependencies
): boolean {
  if (expression === null || typeof expression === 'undefined' || expression.type !== 'ArrowFunctionExpression') {
    return false
  }

  return collectArrowCaptures(expression, scopes, context, deps).length > 0
}

function shouldPromotePlainFunctionExpression(
  expression: AnyNode,
  functionType: CFunctionType | null | undefined,
  scopes: CallbackScope[],
  context: CallbackEmitContext,
  deps: CallbackLoweringDependencies
): boolean {
  return (
    isPlainFunctionPointerType(functionType) &&
    isSupportedRuntimeCallbackType(functionType) &&
    callbackExpressionHasCaptures(expression, scopes, context, deps)
  )
}

function registerNamedCallbackWrapper(
  expression: AnyNode | null | undefined,
  functionType: CFunctionType,
  wrappers: CallbackWrapperMap,
  context: CallbackEmitContext
): void {
  if (expression === null || typeof expression === 'undefined' || expression.type !== 'Reference') {
    return
  }

  if (expression.path.length !== 1) {
    return
  }

  const target = expression.path[0]
  const cTarget = typeof expression.libraryCExpression === 'string' ? expression.libraryCExpression : null

  if (!context.functionNames.has(target) && cTarget === null) {
    return
  }

  const key = runtimeCallbackWrapperKey(target, functionType)

  if (wrappers.has(key)) {
    return
  }

  const wrapper: CCallbackWrapper = {
    kind: 'named',
    key: key,
    name: `inox_callback_${emitCIdentifier(target)}_${wrappers.size}`,
    target: target,
    cTarget,
    targetFunctionType: libraryCallbackTargetFunctionType(expression, functionType, cTarget),
    functionType: functionType,
    needsEventLoop: callbackBooleanValueIsTrue(context.functionAsyncFlags.get(target))
  }

  wrappers.set(key, wrapper)
}

function libraryCallbackTargetFunctionType(
  expression: AnyNode,
  callbackFunctionType: CFunctionType,
  cTarget: string | null
): CFunctionType | null {
  if (cTarget === null) {
    return null
  }

  const declared = normalizeFunctionType(expression.functionType)
  const contextual = normalizeFunctionType(callbackFunctionType)
  const params: CFunctionParam[] = []

  for (let index = 0; index < declared.params.length; index = index + 1) {
    const declaredParam = declared.params[index]
    const contextualParam = contextual.params[index]

    if (contextualParam !== null && typeof contextualParam !== 'undefined') {
      params.push({ ...contextualParam, name: declaredParam.name })
    } else {
      params.push(declaredParam)
    }
  }

  return { ...declared, params }
}

function registerArrowCallbackWrapper(
  expression: AnyNode,
  functionType: CFunctionType,
  scopes: CallbackScope[],
  wrappers: CallbackWrapperMap,
  context: CallbackEmitContext,
  deps: CallbackLoweringDependencies
): void {
  const existing = context.callbackArrowWrappers.get(expression)

  if (existing !== null && typeof existing !== 'undefined') {
    return
  }

  const index = wrappers.size
  const key = `arrow:${index}`
  const captures = collectArrowCaptures(expression, scopes, context, deps)

  for (let captureIndex = 0; captureIndex < captures.length; captureIndex = captureIndex + 1) {
    const capture = captures[captureIndex]
    const declaration = capture.declaration

    if (
      callbackBooleanValueIsTrue(capture.mutable) &&
      isSupportedRuntimeCallbackParamValueType(capture.valueType) &&
      declaration !== null &&
      typeof declaration !== 'undefined'
    ) {
      context.boxedMutableCaptureDeclarations.add(declaration)
    }
  }

  const resolvedFunctionType =
    expression.async === true
      ? normalizeFunctionType(functionType)
      : refineArrowCallbackFunctionType(expression, functionType)
  const wrapper: CCallbackWrapper = {
    kind: 'arrow',
    key: key,
    name: `inox_callback_arrow_${index}`,
    contextTypeName: `inox_callback_context_${index}`,
    finalizerName: `inox_callback_context_${index}_finalize`,
    expression: expression,
    functionType: resolvedFunctionType,
    needsEventLoop:
      expression.async === true || functionUsesExternalEventLoop(expression, context.externalEventLoopFunctions, deps),
    captures: captures
  }

  wrappers.set(key, wrapper)
  context.callbackArrowWrappers.set(expression, wrapper)
}

function registerPlainArrowCallbackWrapper(
  expression: AnyNode,
  functionType: CFunctionType,
  scopes: CallbackScope[],
  wrappers: CallbackWrapperMap,
  context: CallbackEmitContext,
  deps: CallbackLoweringDependencies
): void {
  const existing = context.callbackArrowWrappers.get(expression)

  if (existing !== null && typeof existing !== 'undefined') {
    if (existing.kind === 'plain-arrow') {
      existing.functionType = mergeArrowCallbackFunctionTypes(
        existing.functionType,
        refineArrowCallbackFunctionType(expression, functionType)
      )
    }

    return
  }

  const captures = collectArrowCaptures(expression, scopes, context, deps)

  if (captures.length > 0 && !capturesAreModuleValues(captures, context)) {
    return
  }

  const resolvedFunctionType = refineArrowCallbackFunctionType(expression, functionType)
  const index = wrappers.size
  const key = `plain-arrow:${index}`
  const wrapper: CCallbackWrapper = {
    kind: 'plain-arrow',
    key: key,
    name: `inox_callback_arrow_${index}`,
    expression: expression,
    functionType: resolvedFunctionType
  }

  wrappers.set(key, wrapper)
  context.callbackArrowWrappers.set(expression, wrapper)
}

function refineArrowCallbackFunctionType(expression: AnyNode, functionType: CFunctionType): CFunctionType {
  const params: CFunctionParam[] = []
  const expressionParams = callbackArrowParams(expression)

  for (let index = 0; index < functionType.params.length; index = index + 1) {
    const param = functionType.params[index]
    const arrowParam = index < expressionParams.length ? expressionParams[index] : null
    const refined: CFunctionParam = {
      name: param.name,
      typeRef: param.typeRef,
      valueType: param.valueType
    }

    refined.declaredType = param.declaredType
    refined.functionType = param.functionType
    refined.asyncResultValueType = param.asyncResultValueType
    refined.shape = param.shape
    refined.defaultValue = param.defaultValue
    refined.optional = param.optional
    refined.rest = param.rest

    if (param.nullable === true) {
      refined.nullable = true
    }

    if (arrowParam !== null && typeof arrowParam !== 'undefined') {
      if (arrowParam.name !== null && typeof arrowParam.name !== 'undefined') {
        refined.name = arrowParam.name
      }

      if (
        arrowParam.valueType !== null &&
        typeof arrowParam.valueType !== 'undefined' &&
        arrowParam.valueType !== 'unknown'
      ) {
        refined.valueType = arrowParam.valueType
      }

      refined.typeRef = preferredCallbackTypeRef(cTypeRefValue(arrowParam.typeRef), cTypeRefValue(refined.typeRef))

      refined.declaredType = preferredCallbackMetadata(arrowParam.declaredType, refined.declaredType)

      if (arrowParam.functionType !== null && typeof arrowParam.functionType !== 'undefined') {
        refined.functionType = arrowParam.functionType
      }

      if (arrowParam.nullable === true) {
        refined.nullable = true
      }

      if (arrowParam.asyncResultValueType !== null && typeof arrowParam.asyncResultValueType !== 'undefined') {
        refined.asyncResultValueType = arrowParam.asyncResultValueType
      }

      if (arrowParam.shape !== null && typeof arrowParam.shape !== 'undefined') {
        refined.shape = arrowParam.shape
      }
    }

    params.push(refined)
  }

  const result: CFunctionType = {
    declaredReturnType: functionType.declaredReturnType,
    kind: 'function',
    params,
    returnType: functionType.returnType
  }

  result.returnTypeRef = functionType.returnTypeRef
  result.returnAsyncResultValueType = functionType.returnAsyncResultValueType
  result.returnShape = functionType.returnShape

  if (functionType.returnNullable === true) {
    result.returnNullable = true
  }

  if (
    expression.returnType !== null &&
    typeof expression.returnType !== 'undefined' &&
    expression.returnType !== 'unknown'
  ) {
    result.returnType = expression.returnType
  }

  if (expression.returnTypeRef !== null && typeof expression.returnTypeRef !== 'undefined') {
    result.returnTypeRef = expression.returnTypeRef
  }

  if (expression.returnNullable === true) {
    result.returnNullable = true
  }

  if (expression.returnAsyncResultValueType !== null && typeof expression.returnAsyncResultValueType !== 'undefined') {
    result.returnAsyncResultValueType = expression.returnAsyncResultValueType
  }

  if (expression.returnShape !== null && typeof expression.returnShape !== 'undefined') {
    result.returnShape = expression.returnShape
  }

  return result
}

function mergeArrowCallbackFunctionTypes(left: CFunctionType, right: CFunctionType): CFunctionType {
  const params: CFunctionParam[] = []
  const paramCount = Math.max(left.params.length, right.params.length)

  for (let index = 0; index < paramCount; index = index + 1) {
    const leftParam = left.params[index] ?? null
    const rightParam = right.params[index] ?? null

    if (
      (leftParam === null || typeof leftParam === 'undefined') &&
      rightParam !== null &&
      typeof rightParam !== 'undefined'
    ) {
      params.push(cloneCallbackFunctionParam(rightParam))
    } else if (
      (rightParam === null || typeof rightParam === 'undefined') &&
      leftParam !== null &&
      typeof leftParam !== 'undefined'
    ) {
      params.push(cloneCallbackFunctionParam(leftParam))
    } else if (
      leftParam !== null &&
      typeof leftParam !== 'undefined' &&
      rightParam !== null &&
      typeof rightParam !== 'undefined'
    ) {
      params.push(mergeCallbackFunctionParam(leftParam, rightParam))
    }
  }

  const result: CFunctionType = {
    declaredReturnType: left.declaredReturnType ?? right.declaredReturnType,
    kind: 'function',
    params,
    returnType: preferredCallbackValueType(left.returnType, right.returnType)
  }

  result.returnTypeRef = left.returnTypeRef ?? right.returnTypeRef
  result.returnAsyncResultValueType = preferredCallbackMetadata(
    left.returnAsyncResultValueType,
    right.returnAsyncResultValueType
  )
  result.returnShape = preferredCallbackShape(left.returnShape, right.returnShape)

  if (left.returnNullable === true || right.returnNullable === true) {
    result.returnNullable = true
  }

  return result
}

function mergeCallbackFunctionParam(left: CFunctionParam, right: CFunctionParam): CFunctionParam {
  const result: CFunctionParam = {
    name: preferredCallbackParamName(left.name, right.name),
    typeRef: preferredCallbackTypeRef(cTypeRefValue(left.typeRef), cTypeRefValue(right.typeRef)),
    valueType: preferredCallbackValueType(left.valueType, right.valueType)
  }

  result.declaredType = preferredCallbackMetadata(left.declaredType, right.declaredType)
  result.functionType = preferredCallbackFunctionType(left.functionType, right.functionType)
  result.asyncResultValueType = preferredCallbackMetadata(left.asyncResultValueType, right.asyncResultValueType)
  result.shape = preferredCallbackShape(left.shape, right.shape)

  if (left.functionTypeOwnership !== null && typeof left.functionTypeOwnership !== 'undefined') {
    result.functionTypeOwnership = left.functionTypeOwnership
  } else if (right.functionTypeOwnership !== null && typeof right.functionTypeOwnership !== 'undefined') {
    result.functionTypeOwnership = right.functionTypeOwnership
  }

  if (left.defaultValue !== null && typeof left.defaultValue !== 'undefined') {
    result.defaultValue = left.defaultValue
  } else if (right.defaultValue !== null && typeof right.defaultValue !== 'undefined') {
    result.defaultValue = right.defaultValue
  }

  if (left.nullable === true || right.nullable === true) {
    result.nullable = true
  }

  if (left.optional === true || right.optional === true) {
    result.optional = true
  }

  return result
}

function cloneCallbackFunctionParam(param: CFunctionParam): CFunctionParam {
  const result: CFunctionParam = {
    name: param.name,
    typeRef: param.typeRef,
    valueType: param.valueType
  }

  result.declaredType = param.declaredType
  result.defaultValue = param.defaultValue
  result.functionType = param.functionType
  result.asyncResultValueType = param.asyncResultValueType
  result.shape = param.shape

  if (param.functionTypeOwnership !== null && typeof param.functionTypeOwnership !== 'undefined') {
    result.functionTypeOwnership = param.functionTypeOwnership
  }

  if (param.nullable === true) {
    result.nullable = true
  }

  if (param.optional === true) {
    result.optional = true
  }

  return result
}

function preferredCallbackFunctionType(
  left: CFunctionType | null | undefined,
  right: CFunctionType | null | undefined
): CFunctionType | null | undefined {
  if (left === null || typeof left === 'undefined') {
    return right
  }

  if (right === null || typeof right === 'undefined') {
    return left
  }

  return mergeArrowCallbackFunctionTypes(left, right)
}

function preferredCallbackTypeRef(
  left: TypeRef | null | undefined,
  right: TypeRef | null | undefined
): TypeRef | null | undefined {
  if (left === null || typeof left === 'undefined' || left.kind === 'unknown' || left.kind === 'parameter') {
    return right
  }

  return left
}

function preferredCallbackShape(
  left: CObjectShape | null | undefined,
  right: CObjectShape | null | undefined
): CObjectShape | null | undefined {
  if (
    left === null ||
    typeof left === 'undefined' ||
    left.fields === null ||
    typeof left.fields === 'undefined' ||
    left.fields.length === 0
  ) {
    return right
  }

  if (
    right === null ||
    typeof right === 'undefined' ||
    right.fields === null ||
    typeof right.fields === 'undefined' ||
    right.fields.length === 0
  ) {
    return left
  }

  if (right.fields.length > left.fields.length) {
    return right
  }

  return left
}

function preferredCallbackParamName(left: string, right: string): string {
  if (left.length === 0 || left.startsWith('inox_arg_')) {
    return right
  }

  return left
}

function preferredCallbackValueType(left: string, right: string): string {
  if (left === 'unknown') {
    return right
  }

  return left
}

function preferredCallbackMetadata(
  left: string | null | undefined,
  right: string | null | undefined
): string | null | undefined {
  if (left === null || typeof left === 'undefined' || left === 'unknown' || left === 'object') {
    return right
  }

  return left
}

function capturesAreModuleValues(captures: CRuntimeArrowCapture[], context: CallbackEmitContext): boolean {
  const moduleValueNames = context.moduleValueNames

  if (moduleValueNames === null || typeof moduleValueNames === 'undefined') {
    return false
  }

  for (let index = 0; index < captures.length; index = index + 1) {
    const capture = captures[index]

    if (!moduleValueNames.has(capture.name)) {
      return false
    }
  }

  return true
}

function declareCallbackBinding(scope: CallbackScope, name: string, info: CallbackScopeBinding): void {
  scope.set(name, info)
}

function declareCallbackParams(scope: CallbackScope, params: (CFunctionParam | CallbackNode)[]): void {
  for (let index = 0; index < params.length; index = index + 1) {
    const param = params[index]
    const name = callbackStringOrNull(param.name)

    if (name === null) {
      continue
    }

    const valueType = callbackStringOrUnknown(param.valueType)

    declareCallbackBinding(scope, name, {
      name,
      valueType,
      declaration: param,
      functionType: param.functionType,
      nullable: param.nullable === true,
      shape: param.shape,
      runtimeManaged: isManagedRuntimeCallbackParamValueType(valueType),
      mutable: true
    })
  }
}

function findCallbackBinding(name: string, scopes: CallbackScope[]): CallbackScopeBinding | null {
  for (let index = scopes.length - 1; index >= 0; index = index - 1) {
    const scope = scopes[index]

    if (!scope.has(name)) {
      continue
    }

    const entry = scope.get(name)

    if (entry !== null && typeof entry !== 'undefined') {
      return entry
    }
  }

  return null
}

function declareCallbackVariable(
  scope: CallbackScope,
  statement: AnyNode,
  scopes: CallbackScope[],
  context: CallbackEmitContext,
  deps: CallbackLoweringDependencies
): void {
  let valueType = callbackStringOrUnknown(statement.valueType)
  const functionType = callbackVariableFunctionType(statement)

  syncCallbackVariableFunctionType(statement, functionType)

  if (functionType !== null) {
    valueType = 'function'
  }

  if (valueType === 'unknown') {
    valueType = inferCapturedExpressionValueType(statement.init, scopes)
  }

  declareCallbackBinding(scope, statement.name, {
    name: statement.name,
    valueType: valueType,
    functionType,
    declaration: statement,
    nullable: statement.nullable === true,
    shape: statement.shape,
    runtimeCallback: callbackVariableIsRuntimeCallback(statement, valueType, scopes, context, deps),
    runtimeManaged: isRuntimeManagedCaptureBinding(statement, scopes, valueType),
    mutable: statement.kind === 'let'
  })
}

function callbackVariableIsRuntimeCallback(
  statement: AnyNode,
  valueType: string,
  scopes: CallbackScope[],
  context: CallbackEmitContext,
  deps: CallbackLoweringDependencies
): boolean {
  if (isNullableFunctionType(valueType, statement.nullable)) {
    return true
  }

  if (isRuntimeFunctionType(statement.functionType)) {
    return true
  }

  return shouldPromotePlainFunctionExpression(statement.init, statement.functionType, scopes, context, deps)
}

function isRuntimeManagedCaptureBinding(statement: AnyNode, scopes: CallbackScope[], valueType: string): boolean {
  if (valueType === 'object' || valueType === 'bytes' || valueType === 'function') {
    return true
  }

  if (valueType !== 'string') {
    return false
  }

  if (statement.init !== null && typeof statement.init !== 'undefined' && statement.init.type === 'StringLiteral') {
    return false
  }

  if (
    statement.init !== null &&
    typeof statement.init !== 'undefined' &&
    statement.init.type === 'TemplateLiteral' &&
    !statement.init.raw.includes('${')
  ) {
    return false
  }

  const initName = callbackReferenceNameOrNull(statement.init)

  if (initName !== null && typeof initName !== 'undefined') {
    const binding = findCallbackBinding(initName, scopes)

    if (binding !== null && typeof binding !== 'undefined' && binding.runtimeManaged === true) {
      return true
    }

    return false
  }

  return true
}

function inferCapturedExpressionValueType(expression: AnyNode | null | undefined, scopes: CallbackScope[]): string {
  if (
    expression !== null &&
    typeof expression !== 'undefined' &&
    expression.valueType !== null &&
    typeof expression.valueType !== 'undefined' &&
    expression.valueType !== 'unknown'
  ) {
    return expression.valueType
  }

  if (
    expression !== null &&
    typeof expression !== 'undefined' &&
    expression.type === 'Reference' &&
    expression.path.length === 1
  ) {
    const binding = findCallbackBinding(expression.path[0], scopes)

    if (binding !== null && typeof binding !== 'undefined') {
      return binding.valueType
    }

    return 'unknown'
  }

  if (expression !== null && typeof expression !== 'undefined' && expression.type === 'MemberExpression') {
    const object = inferCapturedExpressionInfo(expression.object, scopes)
    return objectShapeFieldValueType(object.shape, expression.property)
  }

  if (
    expression !== null &&
    typeof expression !== 'undefined' &&
    expression.type === 'IndexExpression' &&
    expression.index.type === 'StringLiteral'
  ) {
    const object = inferCapturedExpressionInfo(expression.object, scopes)
    return objectShapeFieldValueType(object.shape, expression.index.value)
  }

  return 'unknown'
}

function inferCapturedExpressionInfo(
  expression: AnyNode | null | undefined,
  scopes: CallbackScope[]
): CallbackScopeBinding {
  if (
    expression !== null &&
    typeof expression !== 'undefined' &&
    expression.type === 'Reference' &&
    expression.path.length === 1
  ) {
    const entry = findCallbackBinding(expression.path[0], scopes)

    if (entry !== null && typeof entry !== 'undefined') {
      return entry
    }
  }

  return {
    valueType: inferCapturedExpressionValueType(expression, scopes),
    name: '',
    shape: null
  }
}

function objectShapeFieldValueType(shape: CObjectShape | null | undefined, name: string): string {
  if (shape === null || typeof shape === 'undefined') {
    return 'unknown'
  }

  const fields = shape.fields

  if (fields === null || typeof fields === 'undefined') {
    return 'unknown'
  }

  for (let index = 0; index < fields.length; index = index + 1) {
    const field = fields[index]

    if (field.name === name) {
      return field.valueType
    }
  }

  return 'unknown'
}

function visitCallbackStatement(
  statement: AnyNode | null | undefined,
  scopes: CallbackScope[],
  wrappers: CallbackWrapperMap,
  pendingPlainFunctionArgs: PendingPlainFunctionArg[],
  context: CallbackEmitContext,
  deps: CallbackLoweringDependencies
): void {
  if (statement === null || typeof statement === 'undefined') {
    return
  }

  if (statement.type === 'VariableDeclaration') {
    const functionType = callbackVariableFunctionType(statement)

    syncCallbackVariableFunctionType(statement, functionType)

    if (isNullableFunctionType(statement.valueType, statement.nullable)) {
      registerRuntimeCallbackExpression(statement.init, functionType, scopes, wrappers, context, deps)
    } else if (isRuntimeFunctionType(functionType)) {
      registerRuntimeCallbackExpression(statement.init, functionType, scopes, wrappers, context, deps)
    } else if (shouldPromotePlainFunctionExpression(statement.init, functionType, scopes, context, deps)) {
      registerRuntimeCallbackExpression(statement.init, functionType, scopes, wrappers, context, deps)
    } else {
      registerCallbackExpression(statement.init, functionType, scopes, wrappers, context, deps)
    }

    let objectShape = statement.shape

    if (
      (objectShape === null ||
        typeof objectShape === 'undefined' ||
        objectShape.fields === null ||
        typeof objectShape.fields === 'undefined') &&
      context.moduleObjectShapes !== null &&
      typeof context.moduleObjectShapes !== 'undefined'
    ) {
      const moduleFields = context.moduleObjectShapes.get(statement.name)

      if (moduleFields !== null && typeof moduleFields !== 'undefined') {
        objectShape = { fields: moduleFields }
      }
    }

    if (
      statement.valueType === 'object' &&
      statement.init !== null &&
      typeof statement.init !== 'undefined' &&
      statement.init.type === 'ObjectLiteral' &&
      objectShape !== null &&
      typeof objectShape !== 'undefined'
    ) {
      const seenTypes: string[] = []
      const declaredType = objectShapeDeclaredType(statement.valueType, statement.declaredType, objectShape)
      const pushedTypes = pushSeenDeclaredType(seenTypes, declaredType)

      visitCallbackObjectShapeFunctionArg(statement.init, objectShape, seenTypes, scopes, wrappers, context, deps)
      popSeenDeclaredTypes(seenTypes, pushedTypes)
    }

    visitCallbackExpression(statement.init, scopes, wrappers, pendingPlainFunctionArgs, context, deps)
    const scope = scopes[scopes.length - 1]

    if (scope === null || typeof scope === 'undefined') {
      throw new Error('callback variable scope is missing')
    }

    declareCallbackVariable(scope, statement, scopes, context, deps)
    return
  }

  if (statement.type === 'ExpressionStatement') {
    visitCallbackExpression(statement.expression, scopes, wrappers, pendingPlainFunctionArgs, context, deps)
    return
  }

  if (statement.type === 'ReturnStatement') {
    const argument = statement.argument

    if (
      argument !== null &&
      typeof argument !== 'undefined' &&
      (argument.type === 'ArrowFunctionExpression' ||
        argument.valueType === 'function' ||
        (argument.functionType !== null && typeof argument.functionType !== 'undefined'))
    ) {
      registerRuntimeCallbackExpression(argument, argument.functionType, scopes, wrappers, context, deps)
    } else {
      visitCallbackExpression(argument, scopes, wrappers, pendingPlainFunctionArgs, context, deps)
    }
    return
  }

  if (statement.type === 'ThrowStatement') {
    visitCallbackExpression(statement.argument, scopes, wrappers, pendingPlainFunctionArgs, context, deps)
    return
  }

  if (statement.type === 'BlockStatement') {
    const scope: CallbackScope = new Map()
    const blockScopes = appendCallbackScope(scopes, scope)

    for (let index = 0; index < statement.body.length; index = index + 1) {
      const item = statement.body[index]

      visitCallbackStatement(item, blockScopes, wrappers, pendingPlainFunctionArgs, context, deps)
    }
    return
  }

  if (statement.type === 'IfStatement') {
    visitCallbackExpression(statement.condition, scopes, wrappers, pendingPlainFunctionArgs, context, deps)
    visitCallbackStatement(statement.consequent, scopes, wrappers, pendingPlainFunctionArgs, context, deps)
    visitCallbackStatement(statement.alternate, scopes, wrappers, pendingPlainFunctionArgs, context, deps)
    return
  }

  if (statement.type === 'WhileStatement') {
    visitCallbackExpression(statement.condition, scopes, wrappers, pendingPlainFunctionArgs, context, deps)
    visitCallbackStatement(statement.body, scopes, wrappers, pendingPlainFunctionArgs, context, deps)
    return
  }

  if (statement.type === 'ForStatement') {
    const scope: CallbackScope = new Map()
    const loopScopes = appendCallbackScope(scopes, scope)

    if (
      statement.init !== null &&
      typeof statement.init !== 'undefined' &&
      statement.init.type === 'VariableDeclaration'
    ) {
      visitCallbackStatement(statement.init, loopScopes, wrappers, pendingPlainFunctionArgs, context, deps)
    } else {
      visitCallbackExpression(statement.init, loopScopes, wrappers, pendingPlainFunctionArgs, context, deps)
    }

    visitCallbackExpression(statement.test, loopScopes, wrappers, pendingPlainFunctionArgs, context, deps)
    visitCallbackExpression(statement.update, loopScopes, wrappers, pendingPlainFunctionArgs, context, deps)
    visitCallbackStatement(statement.body, loopScopes, wrappers, pendingPlainFunctionArgs, context, deps)
    return
  }

  if (statement.type === 'ForOfStatement') {
    visitCallbackExpression(statement.iterable, scopes, wrappers, pendingPlainFunctionArgs, context, deps)
    const scope: CallbackScope = new Map()
    declareCallbackBinding(scope, statement.name, {
      name: statement.name,
      valueType: 'unknown',
      mutable: statement.kind === 'let'
    })
    visitCallbackStatement(
      statement.body,
      appendCallbackScope(scopes, scope),
      wrappers,
      pendingPlainFunctionArgs,
      context,
      deps
    )
    return
  }

  if (statement.type === 'SwitchStatement') {
    visitCallbackExpression(statement.discriminant, scopes, wrappers, pendingPlainFunctionArgs, context, deps)

    for (let index = 0; index < statement.cases.length; index = index + 1) {
      const item = statement.cases[index]
      const consequent = callbackNodeArray(item.consequent)

      visitCallbackExpression(item.test, scopes, wrappers, pendingPlainFunctionArgs, context, deps)
      const scope: CallbackScope = new Map()
      const caseScopes = appendCallbackScope(scopes, scope)

      for (let consequentIndex = 0; consequentIndex < consequent.length; consequentIndex = consequentIndex + 1) {
        const caseStatement = consequent[consequentIndex]

        visitCallbackStatement(caseStatement, caseScopes, wrappers, pendingPlainFunctionArgs, context, deps)
      }
    }
    return
  }

  if (statement.type === 'TryStatement') {
    visitCallbackStatement(statement.block, scopes, wrappers, pendingPlainFunctionArgs, context, deps)

    if (statement.handler !== null && typeof statement.handler !== 'undefined') {
      visitCallbackStatement(statement.handler.body, scopes, wrappers, pendingPlainFunctionArgs, context, deps)
    }

    visitCallbackStatement(statement.finalizer, scopes, wrappers, pendingPlainFunctionArgs, context, deps)
  }
}

function visitCallbackExpression(
  expression: AnyNode | null | undefined,
  scopes: CallbackScope[],
  wrappers: CallbackWrapperMap,
  pendingPlainFunctionArgs: PendingPlainFunctionArg[],
  context: CallbackEmitContext,
  deps: CallbackLoweringDependencies
): void {
  if (expression === null || typeof expression === 'undefined') {
    return
  }

  if (expression.type === 'TemplateLiteral') {
    const placeholders = deps.collectTemplatePlaceholderExpressions(expression)

    for (let index = 0; index < placeholders.length; index = index + 1) {
      visitCallbackExpression(placeholders[index], scopes, wrappers, pendingPlainFunctionArgs, context, deps)
    }

    return
  }

  if (expression.type === 'CallExpression') {
    visitCallbackCallExpression(expression, scopes, wrappers, pendingPlainFunctionArgs, context, deps)
    return
  }

  if (expression.type === 'AssignmentExpression') {
    const targetInfo = callbackAssignmentTargetInfo(expression.target, scopes)

    if (
      targetInfo !== null &&
      typeof targetInfo !== 'undefined' &&
      isNullableFunctionType(targetInfo.valueType, targetInfo.nullable)
    ) {
      registerRuntimeCallbackExpression(expression.value, targetInfo.functionType, scopes, wrappers, context, deps)
    } else if (
      targetInfo !== null &&
      typeof targetInfo !== 'undefined' &&
      isRuntimeFunctionType(targetInfo.functionType)
    ) {
      registerRuntimeCallbackExpression(expression.value, targetInfo.functionType, scopes, wrappers, context, deps)
    }

    let objectShape: CObjectShape | null | undefined = null

    if (targetInfo !== null && typeof targetInfo !== 'undefined') {
      objectShape = targetInfo.shape
    }

    if (
      (objectShape === null ||
        typeof objectShape === 'undefined' ||
        objectShape.fields === null ||
        typeof objectShape.fields === 'undefined') &&
      context.moduleObjectShapes !== null &&
      typeof context.moduleObjectShapes !== 'undefined'
    ) {
      const targetName = callbackReferenceNameOrNull(expression.target)

      if (targetName !== null && typeof targetName !== 'undefined') {
        const moduleFields = context.moduleObjectShapes.get(targetName)

        if (moduleFields !== null && typeof moduleFields !== 'undefined') {
          objectShape = { fields: moduleFields }
        }
      }
    }

    if (
      targetInfo !== null &&
      typeof targetInfo !== 'undefined' &&
      targetInfo.valueType === 'object' &&
      expression.value !== null &&
      typeof expression.value !== 'undefined' &&
      expression.value.type === 'ObjectLiteral' &&
      objectShape !== null &&
      typeof objectShape !== 'undefined'
    ) {
      const seenTypes: string[] = []
      let declaredTypeName: string | null | undefined = null

      if (targetInfo.declaration !== null && typeof targetInfo.declaration !== 'undefined') {
        declaredTypeName = targetInfo.declaration.declaredType
      }

      const declaredType = objectShapeDeclaredType(targetInfo.valueType, declaredTypeName, objectShape)
      const pushedTypes = pushSeenDeclaredType(seenTypes, declaredType)

      visitCallbackObjectShapeFunctionArg(expression.value, objectShape, seenTypes, scopes, wrappers, context, deps)
      popSeenDeclaredTypes(seenTypes, pushedTypes)
    }

    visitCallbackExpression(expression.target, scopes, wrappers, pendingPlainFunctionArgs, context, deps)
    visitCallbackExpression(expression.value, scopes, wrappers, pendingPlainFunctionArgs, context, deps)
    return
  }

  if (expression.type === 'BinaryExpression') {
    visitCallbackExpression(expression.left, scopes, wrappers, pendingPlainFunctionArgs, context, deps)
    visitCallbackExpression(expression.right, scopes, wrappers, pendingPlainFunctionArgs, context, deps)
    return
  }

  if (
    expression.type === 'UnaryExpression' ||
    expression.type === 'UpdateExpression' ||
    expression.type === 'AwaitExpression' ||
    expression.type === 'SpreadElement'
  ) {
    visitCallbackExpression(expression.argument, scopes, wrappers, pendingPlainFunctionArgs, context, deps)
    return
  }

  if (expression.type === 'MemberExpression' || expression.type === 'OptionalMemberExpression') {
    visitCallbackExpression(expression.object, scopes, wrappers, pendingPlainFunctionArgs, context, deps)
    return
  }

  if (expression.type === 'IndexExpression' || expression.type === 'OptionalIndexExpression') {
    visitCallbackExpression(expression.object, scopes, wrappers, pendingPlainFunctionArgs, context, deps)
    visitCallbackExpression(expression.index, scopes, wrappers, pendingPlainFunctionArgs, context, deps)
    return
  }

  if (expression.type === 'NewExpression' && isAsyncResultConstructorExpression(expression)) {
    visitAsyncResultConstructorCallbackExpression(expression, scopes, wrappers, pendingPlainFunctionArgs, context, deps)
    return
  }

  if (expression.type === 'NewExpression') {
    visitClassConstructorCallbackExpression(expression, scopes, wrappers, pendingPlainFunctionArgs, context, deps)
    return
  }

  if (expression.type === 'OptionalCallExpression') {
    visitCallbackExpression(expression.callee, scopes, wrappers, pendingPlainFunctionArgs, context, deps)

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = expression.args[index]

      visitCallbackExpression(arg, scopes, wrappers, pendingPlainFunctionArgs, context, deps)
    }
    return
  }

  if (expression.type === 'ArrayLiteral') {
    for (let index = 0; index < expression.elements.length; index = index + 1) {
      const element = expression.elements[index]
      const elementFunctionType = callbackArrayLiteralElementFunctionType(expression, element, context)

      if (elementFunctionType !== null && typeof elementFunctionType !== 'undefined') {
        registerRuntimeCallbackExpression(element, elementFunctionType, scopes, wrappers, context, deps)
      }

      visitCallbackExpression(element, scopes, wrappers, pendingPlainFunctionArgs, context, deps)
    }
    return
  }

  if (expression.type === 'ObjectLiteral') {
    for (let index = 0; index < expression.properties.length; index = index + 1) {
      const property = expression.properties[index]

      if (property.value.functionType !== null && typeof property.value.functionType !== 'undefined') {
        registerRuntimeCallbackExpression(property.value, property.value.functionType, scopes, wrappers, context, deps)
      }

      visitCallbackExpression(property.value, scopes, wrappers, pendingPlainFunctionArgs, context, deps)
    }
    return
  }

  if (expression.type === 'ArrowFunctionExpression') {
    visitNestedCallbackArrowExpression(expression, scopes, wrappers, pendingPlainFunctionArgs, context, deps)
  }
}

function visitClassConstructorCallbackExpression(
  expression: AnyNode,
  scopes: CallbackScope[],
  wrappers: CallbackWrapperMap,
  pendingPlainFunctionArgs: PendingPlainFunctionArg[],
  context: CallbackEmitContext,
  deps: CallbackLoweringDependencies
): void {
  visitCallbackExpression(expression.callee, scopes, wrappers, pendingPlainFunctionArgs, context, deps)

  let params: CFunctionParam[] | null = null

  if (
    expression.callee.type === 'Reference' &&
    expression.callee.path.length === 1 &&
    context.classInfos !== null &&
    typeof context.classInfos !== 'undefined'
  ) {
    const info = context.classInfos.get(expression.callee.path[0])

    if (
      info !== null &&
      typeof info !== 'undefined' &&
      info.constructor !== null &&
      typeof info.constructor !== 'undefined'
    ) {
      params = info.constructor.params
    }
  }

  for (let index = 0; index < expression.args.length; index = index + 1) {
    const arg = expression.args[index]
    const param = params === null ? null : params[index]

    if (
      param !== null &&
      typeof param !== 'undefined' &&
      param.functionType !== null &&
      typeof param.functionType !== 'undefined'
    ) {
      if (isRuntimeFunctionType(param.functionType)) {
        registerRuntimeCallbackExpression(arg, param.functionType, scopes, wrappers, context, deps)
      } else {
        registerCallbackExpression(arg, param.functionType, scopes, wrappers, context, deps)
      }
    }

    if (param !== null && typeof param !== 'undefined' && param.valueType === 'object') {
      visitCallbackObjectFunctionArg(arg, param, scopes, wrappers, context, deps)
    }

    visitCallbackExpression(arg, scopes, wrappers, pendingPlainFunctionArgs, context, deps)
  }
}

function callbackArrayLiteralElementFunctionType(
  arrayExpression: AnyNode,
  element: AnyNode,
  context: CallbackEmitContext
): CFunctionType | null {
  if (element.functionType !== null && typeof element.functionType !== 'undefined') {
    return element.functionType
  }

  return cIterableElementFunctionType(
    arrayExpression.typeRef,
    resolveCCompilerLibrarySet(context.libraries),
    callbackSourceLocation(arrayExpression)
  )
}

function callbackSourceLocation(node: AnyNode): SourceLocation {
  let loc: SourceLocation = { line: 1, column: 1 }
  const nodeLoc = node.loc

  if (nodeLoc !== null && typeof nodeLoc !== 'undefined') {
    loc = nodeLoc
  }

  return loc
}

function visitCallbackCallExpression(
  expression: AnyNode,
  scopes: CallbackScope[],
  wrappers: CallbackWrapperMap,
  pendingPlainFunctionArgs: PendingPlainFunctionArg[],
  context: CallbackEmitContext,
  deps: CallbackLoweringDependencies
): void {
  const runtimeCallback = deps.runtimeCallbackArgumentInfoForCall(expression)

  if (runtimeCallback !== null && !isAsyncResultChainExpression(expression)) {
    registerRuntimeCallbackExpression(
      expression.args[runtimeCallback.index],
      runtimeCallback.functionType,
      scopes,
      wrappers,
      context,
      deps
    )
  }

  const params = resolveStaticFunctionParams(expression.callee, context)

  for (let index = 0; index < expression.args.length; index = index + 1) {
    const arg = expression.args[index]
    let param: CFunctionParam | null = null

    if (params !== null && typeof params !== 'undefined' && index < params.length) {
      param = params[index]
    }

    if (param !== null && typeof param !== 'undefined' && param.valueType === 'function') {
      visitCallbackFunctionArg(expression, arg, index, param, scopes, wrappers, pendingPlainFunctionArgs, context, deps)
    }

    if (param !== null && typeof param !== 'undefined' && param.valueType === 'object') {
      visitCallbackObjectFunctionArg(arg, param, scopes, wrappers, context, deps)
    }

    if (
      (param === null || typeof param === 'undefined') &&
      (arg.type === 'ArrowFunctionExpression' || arg.valueType === 'function') &&
      (expression.libraryCArgumentKinds?.includes('runtime-value') === true ||
        expression.libraryCArgumentKinds?.includes('variadic-runtime-value-array') === true)
    ) {
      registerRuntimeCallbackExpression(arg, arg.functionType, scopes, wrappers, context, deps)
    }

    visitCallbackExpression(arg, scopes, wrappers, pendingPlainFunctionArgs, context, deps)
  }

  visitCallbackExpression(expression.callee, scopes, wrappers, pendingPlainFunctionArgs, context, deps)
}

function visitCallbackObjectFunctionArg(
  arg: AnyNode,
  param: CFunctionParam,
  scopes: CallbackScope[],
  wrappers: CallbackWrapperMap,
  context: CallbackEmitContext,
  deps: CallbackLoweringDependencies
): void {
  const seenTypes: string[] = []

  if (param.declaredType !== null && typeof param.declaredType !== 'undefined') {
    seenTypes.push(param.declaredType)
  }

  visitCallbackObjectShapeFunctionArg(arg, param.shape, seenTypes, scopes, wrappers, context, deps)
}

function visitCallbackObjectShapeFunctionArg(
  arg: AnyNode | null | undefined,
  shape: CObjectShape | null | undefined,
  seenTypes: string[],
  scopes: CallbackScope[],
  wrappers: CallbackWrapperMap,
  context: CallbackEmitContext,
  deps: CallbackLoweringDependencies
): void {
  const fields = shape?.fields

  if (fields === null || typeof fields === 'undefined') {
    return
  }

  for (const field of fields) {
    if (field.valueType === 'function') {
      const value = callbackObjectLiteralPropertyValue(arg, field.name)

      if (value !== null && typeof value !== 'undefined') {
        registerRuntimeCallbackExpression(value, field.functionType, scopes, wrappers, context, deps)
      }
    } else if (field.valueType === 'object') {
      const declaredType = objectShapeDeclaredType(field.valueType, field.declaredType, field.shape)

      if (seenTypesIncludeDeclaredType(seenTypes, declaredType)) {
        continue
      }

      const pushedTypes = pushSeenDeclaredType(seenTypes, declaredType)

      visitCallbackObjectShapeFunctionArg(
        callbackObjectLiteralPropertyValue(arg, field.name),
        field.shape,
        seenTypes,
        scopes,
        wrappers,
        context,
        deps
      )

      popSeenDeclaredTypes(seenTypes, pushedTypes)
    }
  }
}

function callbackObjectLiteralPropertyValue(arg: AnyNode | null | undefined, name: string): AnyNode | null {
  if (arg === null || typeof arg === 'undefined' || arg.type !== 'ObjectLiteral') {
    return null
  }

  for (const property of arg.properties) {
    if (property.key === name) {
      return property.value
    }
  }

  return null
}

function visitCallbackFunctionArg(
  expression: AnyNode,
  arg: AnyNode,
  index: number,
  param: CFunctionParam,
  scopes: CallbackScope[],
  wrappers: CallbackWrapperMap,
  pendingPlainFunctionArgs: PendingPlainFunctionArg[],
  context: CallbackEmitContext,
  deps: CallbackLoweringDependencies
): void {
  const concreteFunctionType = arg.functionType ?? param.functionType

  if (isNullableFunctionType(param.valueType, param.nullable)) {
    registerRuntimeCallbackExpression(arg, concreteFunctionType, scopes, wrappers, context, deps)
    return
  }

  if (isRuntimeFunctionType(param.functionType)) {
    registerRuntimeCallbackExpression(arg, concreteFunctionType, scopes, wrappers, context, deps)
    return
  }

  pendingPlainFunctionArgs.push({
    callee: expression.callee,
    index: index,
    arg: arg,
    functionType: normalizeFunctionType(concreteFunctionType),
    scopes: scopes,
    storageFunctionType: param.functionType
  })

  const argInfo = callbackArgumentInfo(arg, scopes)

  if (
    callbackExpressionHasCaptures(arg, scopes, context, deps) ||
    (argInfo !== null && typeof argInfo !== 'undefined' && argInfo.runtimeCallback === true)
  ) {
    markRuntimeFunctionParam(expression.callee, index, concreteFunctionType, context)
  }
}

function callbackArgumentInfo(arg: AnyNode, scopes: CallbackScope[]): CallbackScopeBinding | null {
  if (arg.type === 'Reference' && arg.path.length === 1) {
    return findCallbackBinding(arg.path[0], scopes)
  }

  return null
}

function callbackAssignmentTargetInfo(
  target: AnyNode | null | undefined,
  scopes: CallbackScope[]
): CallbackScopeBinding | null {
  if (target !== null && typeof target !== 'undefined' && target.type === 'Reference' && target.path.length === 1) {
    return findCallbackBinding(target.path[0], scopes)
  }

  return null
}

function visitAsyncResultConstructorCallbackExpression(
  expression: AnyNode,
  scopes: CallbackScope[],
  wrappers: CallbackWrapperMap,
  pendingPlainFunctionArgs: PendingPlainFunctionArg[],
  context: CallbackEmitContext,
  deps: CallbackLoweringDependencies
): void {
  visitCallbackExpression(expression.callee, scopes, wrappers, pendingPlainFunctionArgs, context, deps)

  const executor = expression.args[0]

  if (executor === null || typeof executor === 'undefined' || executor.type !== 'ArrowFunctionExpression') {
    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = expression.args[index]

      visitCallbackExpression(arg, scopes, wrappers, pendingPlainFunctionArgs, context, deps)
    }
    return
  }

  const scope: CallbackScope = new Map()
  const params = callbackArrowParams(executor)

  for (let index = 0; index < params.length; index = index + 1) {
    const param = params[index]
    declareCallbackBinding(scope, param.name, {
      name: param.name,
      valueType: 'asyncResult-settlement',
      asyncResultSettlementCExpression:
        index === 0 ? expression.libraryCAsyncFulfillExpression : expression.libraryCAsyncRejectExpression,
      asyncResultSettlementCppType: expression.libraryCppType,
      asyncResultSettlementKind: asyncResultSettlementKindForParamIndex(index),
      loc: param.loc,
      mutable: false
    })
  }

  const executorScopes = appendCallbackScope(scopes, scope)

  if (executor.expressionBody) {
    visitCallbackExpression(executor.body, executorScopes, wrappers, pendingPlainFunctionArgs, context, deps)
  } else {
    const statements = callbackBlockStatements(executor.body)

    for (let index = 0; index < statements.length; index = index + 1) {
      const statement = statements[index]

      visitCallbackStatement(statement, executorScopes, wrappers, pendingPlainFunctionArgs, context, deps)
    }
  }
}

function asyncResultSettlementKindForParamIndex(index: number): 'reject' | 'fulfill' {
  if (index === 1) {
    return 'reject'
  }

  return 'fulfill'
}

function visitNestedCallbackArrowExpression(
  expression: AnyNode,
  scopes: CallbackScope[],
  wrappers: CallbackWrapperMap,
  pendingPlainFunctionArgs: PendingPlainFunctionArg[],
  context: CallbackEmitContext,
  deps: CallbackLoweringDependencies
): void {
  const scope: CallbackScope = new Map()
  const params = callbackArrowParams(expression)

  for (let index = 0; index < params.length; index = index + 1) {
    const param = params[index]
    const valueType = callbackStringOrUnknown(param.valueType)

    declareCallbackBinding(scope, param.name, {
      name: param.name,
      valueType,
      declaration: param,
      functionType: param.functionType,
      nullable: param.nullable === true,
      shape: param.shape,
      runtimeManaged: isManagedRuntimeCallbackParamValueType(valueType),
      mutable: false
    })
  }

  const arrowScopes = appendCallbackScope(scopes, scope)

  if (expression.expressionBody) {
    visitCallbackExpression(expression.body, arrowScopes, wrappers, pendingPlainFunctionArgs, context, deps)
  } else {
    const statements = callbackBlockStatements(expression.body)

    for (let index = 0; index < statements.length; index = index + 1) {
      const statement = statements[index]

      visitCallbackStatement(statement, arrowScopes, wrappers, pendingPlainFunctionArgs, context, deps)
    }
  }
}

export function collectArrowCaptures(
  expression: AnyNode,
  outerScopes: CallbackScope[],
  context: CallbackEmitContext,
  deps: CallbackLoweringDependencies
): CRuntimeArrowCapture[] {
  const captures: RuntimeArrowCaptureMap = new Map()
  const localScope: CallbackScope = new Map()
  const params = callbackArrowParams(expression)

  for (let index = 0; index < params.length; index = index + 1) {
    const param = params[index]

    declareCallbackBinding(localScope, param.name, {
      name: param.name,
      valueType: callbackStringOrUnknown(param.valueType),
      mutable: true
    })
  }

  const localScopes: CallbackScope[] = [localScope]

  const state: RuntimeArrowCaptureScanState = {
    captures: captures,
    context: context,
    deps: deps,
    localScopes: localScopes,
    outerScopes: outerScopes
  }

  if (expression.expressionBody) {
    visitRuntimeArrowCaptureExpression(expression.body, state)
  } else {
    const statements = callbackBlockStatements(expression.body)

    for (let index = 0; index < statements.length; index = index + 1) {
      const statement = statements[index]

      visitRuntimeArrowCaptureStatement(statement, state)
    }
  }

  const result: CRuntimeArrowCapture[] = []

  for (const capture of captures.values()) {
    result.push(capture)
  }

  return result
}

function addRuntimeArrowCaptureReference(reference: AnyNode, state: RuntimeArrowCaptureScanState): void {
  if (reference.path.length !== 1) {
    return
  }

  const name = reference.path[0]
  const context = state.context
  const functionNames = context.functionNames

  const local = findCallbackBinding(name, state.localScopes)
  if (local) {
    return
  }

  if (functionNames !== null && typeof functionNames !== 'undefined' && functionNames.has(name)) {
    return
  }

  if (isCJsGlobalRoot(name, state.context)) {
    return
  }

  const moduleValueNames = context.moduleValueNames
  const outer = findCallbackBinding(name, state.outerScopes)

  if (
    moduleValueNames !== null &&
    typeof moduleValueNames !== 'undefined' &&
    moduleValueNames.has(name) &&
    (outer === null || outer.valueType !== 'function')
  ) {
    return
  }

  if (outer !== null && typeof outer !== 'undefined' && !state.captures.has(name)) {
    state.captures.set(name, runtimeArrowCaptureFromBinding(name, outer))
  }
}

function runtimeArrowCaptureFromBinding(name: string, binding: CallbackScopeBinding): CRuntimeArrowCapture {
  return {
    name: name,
    declaration: binding.declaration,
    functionType: binding.functionType,
    loc: binding.loc,
    mutable: binding.mutable,
    asyncResultSettlementCExpression: binding.asyncResultSettlementCExpression,
    asyncResultSettlementCppType: binding.asyncResultSettlementCppType,
    asyncResultSettlementKind: binding.asyncResultSettlementKind,
    runtimeManaged: binding.runtimeManaged,
    shape: binding.shape,
    valueType: binding.valueType
  }
}

function declareRuntimeArrowCaptureLocal(statement: AnyNode, state: RuntimeArrowCaptureScanState): void {
  const scope = state.localScopes[state.localScopes.length - 1]

  if (scope === null || typeof scope === 'undefined') {
    throw new Error('runtime arrow capture scope is missing')
  }

  declareCallbackBinding(scope, statement.name, {
    name: statement.name,
    valueType: callbackStringOrUnknown(statement.valueType),
    functionType: statement.functionType,
    shape: statement.shape,
    mutable: statement.kind === 'let'
  })
}

function visitRuntimeArrowCaptureStatement(
  statement: AnyNode | null | undefined,
  state: RuntimeArrowCaptureScanState
): void {
  if (statement === null || typeof statement === 'undefined') {
    return
  }

  if (statement.type === 'VariableDeclaration') {
    visitRuntimeArrowCaptureExpression(statement.init, state)
    declareRuntimeArrowCaptureLocal(statement, state)
    return
  }

  if (statement.type === 'ExpressionStatement') {
    visitRuntimeArrowCaptureExpression(statement.expression, state)
    return
  }

  if (statement.type === 'ReturnStatement' || statement.type === 'ThrowStatement') {
    visitRuntimeArrowCaptureExpression(statement.argument, state)
    return
  }

  if (statement.type === 'BlockStatement') {
    const scope: CallbackScope = new Map()
    state.localScopes.push(scope)

    for (let index = 0; index < statement.body.length; index = index + 1) {
      const item = statement.body[index]

      visitRuntimeArrowCaptureStatement(item, state)
    }

    state.localScopes.pop()
    return
  }

  if (statement.type === 'IfStatement') {
    visitRuntimeArrowCaptureExpression(statement.condition, state)
    visitRuntimeArrowCaptureStatement(statement.consequent, state)
    visitRuntimeArrowCaptureStatement(statement.alternate, state)
    return
  }

  if (statement.type === 'WhileStatement') {
    visitRuntimeArrowCaptureExpression(statement.condition, state)
    visitRuntimeArrowCaptureStatement(statement.body, state)
    return
  }

  if (statement.type === 'ForStatement') {
    const scope: CallbackScope = new Map()
    state.localScopes.push(scope)

    if (
      statement.init !== null &&
      typeof statement.init !== 'undefined' &&
      statement.init.type === 'VariableDeclaration'
    ) {
      visitRuntimeArrowCaptureStatement(statement.init, state)
    } else {
      visitRuntimeArrowCaptureExpression(statement.init, state)
    }

    visitRuntimeArrowCaptureExpression(statement.test, state)
    visitRuntimeArrowCaptureExpression(statement.update, state)
    visitRuntimeArrowCaptureStatement(statement.body, state)
    state.localScopes.pop()
    return
  }

  if (statement.type === 'ForOfStatement') {
    visitRuntimeArrowCaptureExpression(statement.iterable, state)

    const scope: CallbackScope = new Map()
    declareCallbackBinding(scope, statement.name, {
      name: statement.name,
      valueType: 'unknown',
      mutable: statement.kind === 'let'
    })

    state.localScopes.push(scope)
    visitRuntimeArrowCaptureStatement(statement.body, state)
    state.localScopes.pop()
    return
  }

  if (statement.type === 'SwitchStatement') {
    visitRuntimeArrowCaptureExpression(statement.discriminant, state)

    for (let index = 0; index < statement.cases.length; index = index + 1) {
      const item = statement.cases[index]
      const consequents = callbackNodeArray(item.consequent)

      visitRuntimeArrowCaptureExpression(item.test, state)
      const scope: CallbackScope = new Map()
      state.localScopes.push(scope)

      for (let consequentIndex = 0; consequentIndex < consequents.length; consequentIndex = consequentIndex + 1) {
        const consequent = consequents[consequentIndex]

        visitRuntimeArrowCaptureStatement(consequent, state)
      }

      state.localScopes.pop()
    }
    return
  }

  if (statement.type === 'TryStatement') {
    visitRuntimeArrowCaptureStatement(statement.block, state)

    if (statement.handler !== null && typeof statement.handler !== 'undefined') {
      const catchScope: CallbackScope = new Map()

      if (statement.handler.param !== null && typeof statement.handler.param !== 'undefined') {
        declareCallbackBinding(catchScope, statement.handler.param, {
          name: statement.handler.param,
          valueType: 'string',
          mutable: true
        })
      }

      state.localScopes.push(catchScope)
      visitRuntimeArrowCaptureStatement(statement.handler.body, state)
      state.localScopes.pop()
    }

    visitRuntimeArrowCaptureStatement(statement.finalizer, state)
  }
}

function visitRuntimeArrowCaptureExpression(
  node: AnyNode | null | undefined,
  state: RuntimeArrowCaptureScanState
): void {
  if (node === null || typeof node === 'undefined') {
    return
  }

  if (node.type === 'TemplateLiteral') {
    const placeholders = state.deps.collectTemplatePlaceholderExpressions(node)

    for (let index = 0; index < placeholders.length; index = index + 1) {
      const expression = placeholders[index]

      visitRuntimeArrowCaptureExpression(expression, state)
    }

    return
  }

  if (node.type === 'Reference') {
    addRuntimeArrowCaptureReference(node, state)
    return
  }

  if (node.type === 'ArrowFunctionExpression') {
    const scope: CallbackScope = new Map()
    const params = callbackArrowParams(node)

    for (let index = 0; index < params.length; index = index + 1) {
      const param = params[index]

      declareCallbackBinding(scope, param.name, {
        name: param.name,
        valueType: callbackStringOrUnknown(param.valueType),
        mutable: true
      })
    }

    state.localScopes.push(scope)

    if (node.expressionBody) {
      visitRuntimeArrowCaptureExpression(node.body, state)
    } else {
      const statements = callbackBlockStatements(node.body)

      for (let index = 0; index < statements.length; index = index + 1) {
        visitRuntimeArrowCaptureStatement(statements[index], state)
      }
    }

    state.localScopes.pop()
    return
  }

  if (node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') {
    visitRuntimeArrowCaptureExpression(node.object, state)
    return
  }

  if (node.type === 'IndexExpression' || node.type === 'OptionalIndexExpression') {
    visitRuntimeArrowCaptureExpression(node.object, state)
    visitRuntimeArrowCaptureExpression(node.index, state)
    return
  }

  if (node.type === 'CallExpression' || node.type === 'OptionalCallExpression' || node.type === 'NewExpression') {
    visitRuntimeArrowCaptureExpression(node.callee, state)

    for (let index = 0; index < node.args.length; index = index + 1) {
      const arg = node.args[index]

      visitRuntimeArrowCaptureExpression(arg, state)
    }

    return
  }

  if (node.type === 'AssignmentExpression') {
    visitRuntimeArrowCaptureExpression(node.target, state)
    visitRuntimeArrowCaptureExpression(node.value, state)
    return
  }

  if (node.type === 'BinaryExpression') {
    visitRuntimeArrowCaptureExpression(node.left, state)
    visitRuntimeArrowCaptureExpression(node.right, state)
    return
  }

  if (node.type === 'ConditionalExpression') {
    visitRuntimeArrowCaptureExpression(node.test, state)
    visitRuntimeArrowCaptureExpression(node.consequent, state)
    visitRuntimeArrowCaptureExpression(node.alternate, state)
    return
  }

  if (node.type === 'UnaryExpression' || node.type === 'UpdateExpression' || node.type === 'AwaitExpression') {
    visitRuntimeArrowCaptureExpression(node.argument, state)
    return
  }

  if (node.type === 'ArrayLiteral') {
    for (let index = 0; index < node.elements.length; index = index + 1) {
      const element = node.elements[index]

      visitRuntimeArrowCaptureExpression(element, state)
    }

    return
  }

  if (node.type === 'ObjectLiteral') {
    for (let index = 0; index < node.properties.length; index = index + 1) {
      const property = node.properties[index]

      visitRuntimeArrowCaptureExpression(property.value, state)
    }
  }
}

function resolveStaticFunctionParams(
  callee: AnyNode | null | undefined,
  context: CallbackEmitContext
): CFunctionParam[] | null {
  if (callee === null || typeof callee === 'undefined' || callee.type !== 'Reference' || callee.path.length !== 1) {
    return null
  }

  const params = context.functionParams.get(callee.path[0])

  if (params !== null && typeof params !== 'undefined') {
    return params
  }

  return null
}

function runtimeCallbackWrapperKey(target: string, functionType: CFunctionType): string {
  const paramTypes: string[] = []

  for (let index = 0; index < functionType.params.length; index = index + 1) {
    const param = functionType.params[index]

    paramTypes.push(param.valueType)
  }

  return `${target}:${functionType.returnType}(${joinStrings(paramTypes, ',')})`
}

export function runtimeCallbackWrapperFor(
  target: string,
  functionType: CFunctionType,
  context: CallbackEmitContext
): CCallbackWrapper | null {
  const wrapper = context.callbackWrappers.get(runtimeCallbackWrapperKey(target, functionType))

  if (wrapper !== null && typeof wrapper !== 'undefined') {
    return wrapper
  }

  return null
}

export function emitRuntimeCallbackWrapperHead(wrapper: CRuntimeCallbackWrapper): string {
  const prefix =
    wrapper.kind === 'arrow' && wrapper.expression.inline === true
      ? 'static inline inox_status '
      : 'static inox_status '

  const outType = wrapper.functionType.returnType === 'async-result' ? 'void*' : 'inox_value*'

  return (
    prefix +
    wrapper.name +
    `(void* inox_context, const inox_value* ${runtimeCallbackArgsName}, ` +
    `size_t ${runtimeCallbackArgCountName}, ${outType} inox_callback_out)`
  )
}

export function isRuntimeCallbackWrapper(wrapper: CCallbackWrapper): boolean {
  return wrapper.kind !== 'plain-arrow'
}

export function emitPlainArrowCallbackWrapperHead(wrapper: CPlainArrowCallbackWrapper): string {
  const prefix = wrapper.expression.inline === true ? 'static inline ' : 'static '

  return (
    prefix +
    emitFunctionPointerReturnType(wrapper.functionType) +
    ' ' +
    wrapper.name +
    '(' +
    emitPlainArrowCallbackParams(wrapper) +
    ')'
  )
}

function emitPlainArrowCallbackParams(wrapper: CPlainArrowCallbackWrapper): string {
  const params = wrapper.functionType.params

  if (params.length === 0) {
    return 'void'
  }

  const emitted: string[] = []
  let index = 0

  for (let paramIndex = 0; paramIndex < params.length; paramIndex = paramIndex + 1) {
    const param = params[paramIndex]
    const name = plainArrowCallbackParamName(wrapper, index)
    const cName = plainArrowCallbackCParamName(param, name)
    const seenTypes: string[] = []

    emitted.push(`${emitFunctionPointerParamCType(param)} ${cName}`)

    if (param.declaredType !== null && typeof param.declaredType !== 'undefined') {
      seenTypes.push(param.declaredType)
    }

    pushPlainArrowObjectFunctionFieldParams(emitted, name, param.shape, seenTypes)
    index = index + 1
  }

  return joinStrings(emitted, ', ')
}

function pushPlainArrowObjectFunctionFieldParams(
  params: string[],
  objectName: string,
  shape: CObjectShape | null | undefined,
  seenTypes: string[]
): void {
  const fields = shape?.fields

  if (fields === null || typeof fields === 'undefined') {
    return
  }

  for (const field of fields) {
    if (field.valueType === 'function') {
      if (!isPlainObjectFunctionField(field, seenTypes) && !isRuntimeFunctionType(field.functionType)) {
        continue
      }

      params.push(emitPlainArrowObjectFunctionFieldParam(objectName, field, seenTypes))
    } else if (field.valueType === 'object') {
      const declaredType = objectShapeDeclaredType(field.valueType, field.declaredType, field.shape)

      if (seenTypesIncludeDeclaredType(seenTypes, declaredType)) {
        continue
      }

      const pushedTypes = pushSeenDeclaredType(seenTypes, declaredType)

      pushPlainArrowObjectFunctionFieldParams(params, `${objectName}_${field.name}`, field.shape, seenTypes)
      popSeenDeclaredTypes(seenTypes, pushedTypes)
    }
  }
}

function emitPlainArrowObjectFunctionFieldParam(
  objectName: string,
  field: CObjectShapeField,
  seenTypes: string[]
): string {
  const name = emitCObjectFunctionFieldName(objectName, field.name)

  if (isRuntimeObjectFunctionField(field, seenTypes)) {
    return `inox_value ${name}`
  }

  return `${emitFunctionPointerReturnType(field.functionType)} (*${name})(${emitFunctionPointerParams(field.functionType, [], seenTypes)})`
}

export function emitPlainArrowCallbackWrapperDeclaration(
  wrapper: CPlainArrowCallbackWrapper,
  baseContext: CallbackEmitContext,
  deps: CallbackLoweringDependencies
): string[] {
  const returnType = wrapper.functionType.returnType
  const params = wrapper.functionType.params

  const context = deps.createFunctionContext(baseContext, returnType, wrapper.functionType.returnNullable === true)
  context.cleanupEnabled = false
  context.returnShape = wrapper.functionType.returnShape ?? null
  const paramPrelude: string[] = []

  for (let index = 0; index < params.length; index = index + 1) {
    const param = params[index]
    const name = plainArrowCallbackParamName(wrapper, index)

    context.variables.set(name, param.valueType)

    if (param.valueType === 'string') {
      context.runtimeStrings.add(name)
      paramPrelude.push(`inox_string* ${name} = (inox_string*)${emitCStringParamName(name)}.as.ref;`)
    }

    if (param.valueType === 'object') {
      deps.registerObjectShape(context, name, param.shape)
    }
  }

  const statements = plainArrowCallbackStatements(wrapper.expression, returnType)
  const statementLines = deps.emitStatementList(statements, context)
  const lines: string[] = [emitPlainArrowCallbackWrapperHead(wrapper) + ' {']

  pushIndentedLines(lines, deps.emitReturnValueDeclarations(context))
  pushIndentedLines(lines, deps.emitReturnFlowDeclarations(context))
  pushIndentedLines(lines, deps.emitOwnedValueDeclarations(context))
  pushIndentedLines(lines, deps.emitBoxedValueDeclarations(context))
  pushIndentedLines(lines, paramPrelude)
  pushIndentedLines(lines, statementLines)

  if (deps.shouldEmitCleanupLabel(context)) {
    lines.push('cleanup:')
    pushIndentedLines(lines, deps.emitOwnedValueCleanup(context))
    pushIndentedLines(lines, deps.emitBoxedValueCleanup(context))
    lines.push(`  ${deps.emitCleanupReturn(context)}`)
  }

  lines.push('}')

  return lines
}

function plainArrowCallbackStatements(expression: AnyNode, returnType: ValueType): AnyNode[] {
  if (expression.expressionBody) {
    if (returnType === 'void') {
      return [
        {
          type: 'ExpressionStatement',
          expression: expression.body,
          loc: expression.loc
        }
      ]
    }

    return [
      {
        type: 'ReturnStatement',
        argument: expression.body,
        loc: expression.loc
      }
    ]
  }

  return callbackBlockStatements(expression.body)
}

function callbackBlockStatements(body: AnyNode | AnyNode[]): AnyNode[] {
  if (Array.isArray(body)) {
    return body
  }

  if (body !== null && typeof body !== 'undefined' && body.type === 'BlockStatement') {
    return body.body
  }

  return [body]
}

function plainArrowCallbackParamName(wrapper: CPlainArrowCallbackWrapper, index: number): string {
  const params = callbackArrowParams(wrapper.expression)
  const param = params[index] ?? null

  if (param !== null && typeof param !== 'undefined') {
    return param.name
  }

  return `inox_arg_${index}`
}

function plainArrowCallbackCParamName(param: CFunctionParam, name: string): string {
  if (param.valueType === 'string') {
    return emitCStringParamName(name)
  }

  return name
}

function pushLines(target: string[], lines: string[]): void {
  for (const line of lines) {
    target.push(line)
  }
}

function pushIndentedLines(target: string[], lines: string[]): void {
  for (const line of lines) {
    target.push(`  ${line}`)
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

function runtimeCallbackParamIsOmittable(param: CFunctionParam): boolean {
  return param.optional === true || (param.defaultValue !== null && typeof param.defaultValue !== 'undefined')
}

function runtimeCallbackRequiredParamCount(params: CFunctionParam[]): number {
  let count = 0

  for (let index = 0; index < params.length; index = index + 1) {
    const param = params[index]

    if (param !== null && typeof param !== 'undefined' && !runtimeCallbackParamIsOmittable(param)) {
      count = index + 1
    }
  }

  return count
}

function emitIndentedRuntimeArgCountCheck(params: CFunctionParam[]): string {
  const requiredCount = runtimeCallbackRequiredParamCount(params)

  return (
    `  if (inox_callback_out == 0 || ${runtimeCallbackArgCountName} < ${requiredCount} || ` +
    `(${runtimeCallbackArgCountName} > 0 && ${runtimeCallbackArgsName} == 0)) return INOX_ERR_TYPE;`
  )
}

function emitIndentedRuntimeArgsPadding(params: CFunctionParam[]): string[] {
  const requiredCount = runtimeCallbackRequiredParamCount(params)

  if (requiredCount === params.length) {
    return []
  }

  return [
    `  inox_value inox_callback_padded_args[${params.length}];`,
    `  if (${runtimeCallbackArgCountName} < ${params.length}) {`,
    '    size_t inox_callback_arg_index = 0;',
    `    for (; inox_callback_arg_index < ${runtimeCallbackArgCountName}; inox_callback_arg_index = inox_callback_arg_index + 1) {`,
    `      inox_callback_padded_args[inox_callback_arg_index] = ${runtimeCallbackArgsName}[inox_callback_arg_index];`,
    '    }',
    `    for (; inox_callback_arg_index < ${params.length}; inox_callback_arg_index = inox_callback_arg_index + 1) {`,
    '      inox_callback_padded_args[inox_callback_arg_index] = inox_undefined_value();',
    '    }',
    `    ${runtimeCallbackArgsName} = inox_callback_padded_args;`,
    '  }'
  ]
}

export function emitRuntimeCallbackWrapperDeclaration(
  wrapper: CRuntimeCallbackWrapper,
  context: CallbackEmitContext,
  deps: CallbackLoweringDependencies
): string[] {
  if (wrapper.kind === 'arrow') {
    return emitRuntimeArrowCallbackWrapperDeclaration(wrapper, context, deps)
  }

  if (wrapper.functionType.returnType === 'async-result') {
    return emitNamedAsyncRuntimeCallbackWrapperDeclaration(wrapper, context)
  }

  const targetTakesEventLoop =
    wrapper.needsEventLoop && !callbackBooleanValueIsTrue(context.functionAsyncFlags.get(wrapper.target))
  const wrapperFunctionType = namedRuntimeCallbackWrapperFunctionType(wrapper, context)
  const lines: string[] = [emitRuntimeCallbackWrapperHead(wrapper) + ' {']

  if (targetTakesEventLoop) {
    lines.push('  if (inox_context == 0) return INOX_ERR_TYPE;')
  } else {
    lines.push('  (void)inox_context;')
  }

  lines.push(emitIndentedRuntimeArgCountCheck(wrapperFunctionType.params))
  pushLines(lines, emitIndentedRuntimeArgsPadding(wrapperFunctionType.params))
  lines.push('  *inox_callback_out = inox_undefined_value();')
  const args: string[] = []
  const params: CFunctionParam[] = wrapperFunctionType.params
  let index = 0

  for (const param of params) {
    pushIndentedLines(lines, emitRuntimeCallbackWrapperArgChecks(param, index, context.libraries))
    args.push(emitRuntimeCallbackWrapperArg(param, index))
    index = index + 1
  }

  const callArgs = emitNamedRuntimeCallbackTargetArgs(wrapper, args, targetTakesEventLoop, context)

  const wrapperTarget = wrapper.target
  let functionName = context.functionNames.get(wrapperTarget)

  if (functionName === null || typeof functionName === 'undefined') {
    functionName = wrapper.cTarget ?? emitCFunctionName(wrapperTarget)
  }

  const call = `${functionName}(${joinStrings(callArgs, ', ')})`

  if (
    context.throwingFunctions !== null &&
    typeof context.throwingFunctions !== 'undefined' &&
    context.throwingFunctions.has(wrapperTarget)
  ) {
    pushLines(lines, emitThrowingRuntimeCallbackTargetCall(wrapper, functionName, callArgs, context))
    lines.push('}')

    return lines
  }

  if (wrapper.functionType.returnNullable === true && isNullableScalarType(wrapper.functionType.returnType)) {
    lines.push(`  *inox_callback_out = ${call};`)
  } else if (wrapper.functionType.returnType === 'number') {
    lines.push(`  *inox_callback_out = inox_number_value(${call});`)
  } else if (wrapper.functionType.returnType === 'boolean') {
    lines.push(`  *inox_callback_out = inox_bool_value((${call}) != 0);`)
  } else if (isManagedRuntimeReturnType(wrapper.functionType.returnType)) {
    const targetFunctionType = namedRuntimeCallbackTargetFunctionType(wrapper, context)
    pushManagedRuntimeCallbackResult(
      lines,
      emitCReturnType(
        targetFunctionType.returnType,
        targetFunctionType.returnNullable === true,
        targetFunctionType.returnShape
      ),
      call
    )
  } else {
    lines.push(`  ${call};`)
  }

  lines.push('  return INOX_OK;')
  lines.push('}')

  return lines
}

function emitNamedAsyncRuntimeCallbackWrapperDeclaration(
  wrapper: CNamedCallbackWrapper,
  context: CallbackEmitContext
): string[] {
  const providerCppType = compilerLibraryIntrinsicNativeCppType(
    resolveCCompilerLibrarySet(context.libraries),
    'async-result'
  )
  const lines: string[] = [emitRuntimeCallbackWrapperHead(wrapper) + ' {']
  const wrapperFunctionType = namedRuntimeCallbackWrapperFunctionType(wrapper, context)

  if (providerCppType === null || providerCppType.length === 0) {
    lines.push('  (void)inox_context;')
    lines.push(`  (void)${runtimeCallbackArgsName};`)
    lines.push(`  (void)${runtimeCallbackArgCountName};`)
    lines.push('  (void)inox_callback_out;')
    lines.push('  return INOX_ERR_TYPE;')
    lines.push('}')
    return lines
  }

  lines.push('  (void)inox_context;')

  lines.push(emitIndentedRuntimeArgCountCheck(wrapperFunctionType.params))
  pushLines(lines, emitIndentedRuntimeArgsPadding(wrapperFunctionType.params))
  lines.push(`  ${providerCppType}& inox_async_callback_out = *static_cast<${providerCppType}*>(inox_callback_out);`)
  lines.push('  inox_async_callback_out = {};')
  const args: string[] = []

  for (let index = 0; index < wrapperFunctionType.params.length; index = index + 1) {
    const param = wrapperFunctionType.params[index]
    pushIndentedLines(lines, emitRuntimeCallbackWrapperArgChecks(param, index, context.libraries))
    args.push(emitRuntimeCallbackWrapperArg(param, index))
  }

  const callArgs = emitNamedRuntimeCallbackTargetArgs(wrapper, args, false, context)

  let functionName = context.functionNames.get(wrapper.target)

  if (functionName === null || typeof functionName === 'undefined') {
    functionName = wrapper.cTarget ?? emitCFunctionName(wrapper.target)
  }

  const call = `${functionName}(${joinStrings(callArgs, ', ')})`

  lines.push(`  inox_async_callback_out = ${call};`)
  const valid = compilerLibraryIntrinsicAsyncResultCValidExpression(
    resolveCCompilerLibrarySet(context.libraries),
    'inox_async_callback_out'
  )
  lines.push(`  return ${valid} ? INOX_OK : INOX_ERR_TYPE;`)
  lines.push('}')

  return lines
}

export function emitFunctionPointerRuntimeAdapterDefinition(
  adapter: CFunctionPointerRuntimeAdapter,
  libraries: CCompilerLibrarySet | null | undefined
): string[] {
  const functionType = adapter.functionType
  const lines = [
    `typedef struct ${adapter.contextTypeName} {`,
    `  ${emitFunctionPointerReturnType(functionType)} (*target)(${emitFunctionPointerParams(
      functionType,
      [],
      adapter.seenTypes
    )});`,
    `} ${adapter.contextTypeName};`,
    '',
    `static void ${adapter.finalizerName}(void* context) {`,
    '  if (context == 0) return;',
    `  inox_default_free(0, context, sizeof(${adapter.contextTypeName}), _Alignof(${adapter.contextTypeName}));`,
    '}',
    '',
    `static inox_status ${adapter.callbackName}(`,
    '  void* inox_context,',
    `  const inox_value* ${runtimeCallbackArgsName},`,
    `  size_t ${runtimeCallbackArgCountName},`,
    '  inox_value* inox_callback_out',
    ') {',
    '  if (inox_context == 0) return INOX_ERR_TYPE;',
    emitIndentedRuntimeArgCountCheck(functionType.params),
    ...emitIndentedRuntimeArgsPadding(functionType.params),
    '  *inox_callback_out = inox_undefined_value();',
    `  ${adapter.contextTypeName}* captured = (${adapter.contextTypeName}*)inox_context;`,
    '  if (captured->target == 0) return INOX_ERR_TYPE;'
  ]
  const args: string[] = []
  let index = 0

  for (const param of functionType.params) {
    pushIndentedLines(lines, emitRuntimeCallbackWrapperArgChecks(param, index, libraries))
    args.push(emitRuntimeCallbackWrapperArg(param, index))
    index = index + 1
  }

  const call = `captured->target(${joinStrings(args, ', ')})`

  if (functionType.returnNullable === true && isNullableScalarType(functionType.returnType)) {
    lines.push(`  *inox_callback_out = ${call};`)
  } else if (functionType.returnType === 'number') {
    lines.push(`  *inox_callback_out = inox_number_value(${call});`)
  } else if (functionType.returnType === 'boolean') {
    lines.push(`  *inox_callback_out = inox_bool_value((${call}) != 0);`)
  } else if (isManagedRuntimeReturnType(functionType.returnType) || functionType.returnType === 'unknown') {
    pushManagedRuntimeCallbackResult(lines, emitFunctionPointerReturnType(functionType), call)
  } else {
    lines.push(`  ${call};`)
  }

  lines.push('  return INOX_OK;')
  lines.push('}')

  return lines
}

function pushManagedRuntimeCallbackResult(lines: string[], resultType: string, call: string): void {
  if (resultType === 'inox_value') {
    lines.push(`  *inox_callback_out = ${call};`)
    return
  }

  lines.push(`  auto inox_callback_result = ${call};`)
  lines.push('  *inox_callback_out = inox_callback_result.release();')
}

function emitThrowingRuntimeCallbackTargetCall(
  wrapper: CNamedCallbackWrapper,
  functionName: string,
  callArgs: string[],
  context?: CallbackEmitContext
): string[] {
  const lines: string[] = []
  const targetFunctionType =
    context === null || typeof context === 'undefined'
      ? wrapper.functionType
      : namedRuntimeCallbackTargetFunctionType(wrapper, context)
  const resultType = throwingRuntimeCallbackTargetResultType(targetFunctionType)
  const call = `${functionName}(${joinStrings(callArgs, ', ')})`

  if (resultType !== 'void') {
    lines.push(`  ${resultType} inox_callback_result = ${call};`)
  } else {
    lines.push(`  ${call};`)
  }

  lines.push('  if (inox::thrown()) return INOX_ERR_THROW;')
  pushLines(lines, emitThrowingRuntimeCallbackResult(wrapper.functionType, resultType))
  lines.push('  return INOX_OK;')

  return lines
}

function throwingRuntimeCallbackTargetResultType(functionType: CFunctionType): string {
  if (functionType.returnType === 'void') {
    return 'void'
  }

  if (functionType.returnNullable === true && isNullableScalarType(functionType.returnType)) {
    return 'inox_value'
  }

  return emitCReturnType(functionType.returnType, functionType.returnNullable === true, functionType.returnShape)
}

function emitThrowingRuntimeCallbackResult(functionType: CFunctionType, resultType: string): string[] {
  if (resultType === 'void') {
    return []
  }

  if (resultType === 'inox_value') {
    return ['  *inox_callback_out = inox_callback_result;']
  }

  if (isManagedRuntimeReturnType(functionType.returnType) && resultType !== 'inox_value') {
    return ['  *inox_callback_out = inox_callback_result.release();']
  }

  if (functionType.returnType === 'number') {
    return ['  *inox_callback_out = inox_number_value(inox_callback_result);']
  }

  if (functionType.returnType === 'boolean') {
    return ['  *inox_callback_out = inox_bool_value(inox_callback_result != 0);']
  }

  return []
}

function emitNamedRuntimeCallbackTargetArgs(
  wrapper: CNamedCallbackWrapper,
  runtimeArgs: string[],
  targetTakesEventLoop: boolean,
  context: CallbackEmitContext
): string[] {
  const callArgs: string[] = []
  const targetFunctionType = namedRuntimeCallbackTargetFunctionType(wrapper, context)
  const targetNames = collectFunctionPointerParamNames(targetFunctionType)
  const moduleObjectFunctionFields = collectCallbackModuleObjectFunctionFieldNames(context)

  if (targetTakesEventLoop) {
    callArgs.push('(inox_loop*)inox_context')
  }

  for (const name of targetNames) {
    const runtimeArg = runtimeCallbackArgByName(name, runtimeArgs)

    if (runtimeArg !== null && typeof runtimeArg !== 'undefined') {
      callArgs.push(runtimeArg)
      continue
    }

    const runtimeArgIndex = runtimeCallbackArgIndex(name)

    if (runtimeArgIndex !== null && runtimeArgIndex >= runtimeArgs.length) {
      const targetParam = targetFunctionType.params[runtimeArgIndex]

      if (
        targetParam !== null &&
        typeof targetParam !== 'undefined' &&
        (targetParam.optional === true ||
          (targetParam.defaultValue !== null && typeof targetParam.defaultValue !== 'undefined'))
      ) {
        callArgs.push(emitOmittedFunctionPointerArg(targetParam))
        continue
      }
    }

    const moduleObjectFunctionField = emitRuntimeCallbackModuleObjectFieldArg(name, moduleObjectFunctionFields)

    if (moduleObjectFunctionField !== null && typeof moduleObjectFunctionField !== 'undefined') {
      callArgs.push(moduleObjectFunctionField)
      continue
    }

    callArgs.push(name)
  }

  return callArgs
}

function emitOmittedFunctionPointerArg(param: CFunctionParam): string {
  const cType = emitFunctionPointerParamCType(param)

  if (cType === 'inox_value') {
    return 'inox_undefined_value()'
  }

  if (cType === 'void*') {
    return 'nullptr'
  }

  return '0'
}

function namedRuntimeCallbackTargetFunctionType(
  wrapper: CNamedCallbackWrapper,
  context: CallbackEmitContext
): CFunctionType {
  if (wrapper.targetFunctionType !== null && typeof wrapper.targetFunctionType !== 'undefined') {
    return wrapper.targetFunctionType
  }

  const params = context.functionParams.get(wrapper.target)
  const returnType = context.functionReturnTypes.get(wrapper.target)

  if (params === null || typeof params === 'undefined' || returnType === null || typeof returnType === 'undefined') {
    return wrapper.functionType
  }

  const returnShape = context.functionReturnShapes?.get(wrapper.target)
  const returnTypeRef = context.functionReturnTypeRefs?.get(wrapper.target)
  const returnNullable = context.functionReturnNullables?.get(wrapper.target)

  return {
    declaredReturnType: wrapper.functionType.declaredReturnType,
    kind: wrapper.functionType.kind,
    params,
    returnTypeRef: returnTypeRef ?? wrapper.functionType.returnTypeRef,
    returnNullable: returnNullable ?? wrapper.functionType.returnNullable,
    returnAsyncResultValueType: wrapper.functionType.returnAsyncResultValueType,
    returnShape: returnShape ?? wrapper.functionType.returnShape,
    returnType
  }
}

function namedRuntimeCallbackWrapperFunctionType(
  wrapper: CNamedCallbackWrapper,
  context: CallbackEmitContext
): CFunctionType {
  return mergeArrowCallbackFunctionTypes(wrapper.functionType, namedRuntimeCallbackTargetFunctionType(wrapper, context))
}

function runtimeCallbackArgByName(name: string, runtimeArgs: string[]): string | null {
  const index = runtimeCallbackArgIndex(name)

  if (index === null || index >= runtimeArgs.length) {
    return null
  }

  return runtimeArgs[index]
}

function runtimeCallbackArgIndex(name: string): number | null {
  const prefix = 'inox_arg_'

  if (!name.startsWith(prefix)) {
    return null
  }

  let indexEnd = prefix.length
  let value = 0

  while (indexEnd < name.length) {
    const code = name.charCodeAt(indexEnd)

    if (code < 48 || code > 57) {
      break
    }

    value = value * 10 + (code - 48)
    indexEnd = indexEnd + 1
  }

  if (indexEnd === prefix.length || indexEnd !== name.length) {
    return null
  }

  return value
}

function collectCallbackModuleObjectFunctionFieldNames(context: CallbackEmitContext): Set<string> {
  const names: Set<string> = new Set()
  const shapes = context.moduleObjectShapes

  if (shapes === null || typeof shapes === 'undefined') {
    return names
  }

  for (const objectName of shapes.keys()) {
    const fields = shapes.get(objectName)

    if (fields === null || typeof fields === 'undefined') {
      continue
    }

    for (const field of fields) {
      if (field.valueType !== 'function') {
        continue
      }

      if (isPlainObjectFunctionField(field) || isRuntimeFunctionType(field.functionType)) {
        names.add(emitCObjectFunctionFieldName(objectName, field.name))
      }
    }
  }

  return names
}

function emitRuntimeCallbackModuleObjectFieldArg(name: string, moduleObjectFunctionFields: Set<string>): string | null {
  const prefix = 'inox_objfn_inox_arg_'

  if (!name.startsWith(prefix)) {
    return null
  }

  let index = prefix.length

  while (index < name.length) {
    const code = name.charCodeAt(index)

    if (code < 48 || code > 57) {
      break
    }

    index = index + 1
  }

  if (index === prefix.length || name[index] !== '_') {
    return null
  }

  const candidate = `inox_objfn_${name.slice(index + 1)}`

  if (moduleObjectFunctionFields.has(candidate)) {
    return candidate
  }

  return null
}

export function isRuntimeArrowCallbackWrapperWithContext(wrapper: CCallbackWrapper | null | undefined): boolean {
  return (
    wrapper !== null &&
    typeof wrapper !== 'undefined' &&
    wrapper.kind === 'arrow' &&
    hasRuntimeArrowCallbackContext(wrapper)
  )
}

export function isAsyncResultChainCallbackWrapperWithContext(
  wrapper: CAsyncResultChainWrapper | null | undefined
): boolean {
  return (
    wrapper !== null &&
    typeof wrapper !== 'undefined' &&
    wrapper.kind === 'asyncResult-chain-arrow' &&
    hasRuntimeArrowCallbackContext(wrapper)
  )
}

export function hasRuntimeArrowCallbackContext(wrapper: CCallbackContextWrapper): boolean {
  return callbackContextWrapperCaptures(wrapper).length > 0 || callbackContextWrapperNeedsEventLoop(wrapper)
}

export function callbackContextWrapperCaptures(wrapper: AnyNode): CRuntimeArrowCapture[] {
  return wrapper.captures
}

export function callbackContextWrapperContextTypeName(wrapper: AnyNode): string {
  return wrapper.contextTypeName
}

export function callbackContextWrapperFinalizerName(wrapper: AnyNode): string {
  return wrapper.finalizerName
}

export function callbackContextWrapperNeedsEventLoop(wrapper: AnyNode): boolean {
  return wrapper.needsEventLoop === true
}

export function emitRuntimeArrowCallbackContextType(wrapper: CCallbackContextWrapper): string[] {
  const captures = callbackContextWrapperCaptures(wrapper)
  const contextTypeName = callbackContextWrapperContextTypeName(wrapper)
  const lines: string[] = ['typedef struct ' + contextTypeName + ' {']

  if (callbackContextWrapperNeedsEventLoop(wrapper)) {
    lines.push('  inox_loop* inox_loop;')
  }

  for (let index = 0; index < captures.length; index = index + 1) {
    const capture = captures[index]
    lines.push('  ' + emitRuntimeArrowCaptureCType(capture) + ' ' + emitRuntimeArrowCaptureField(capture) + ';')
  }

  lines.push('} ' + contextTypeName + ';')

  return lines
}

export function emitRuntimeArrowCallbackContextFinalizerDeclaration(wrapper: CCallbackContextWrapper): string[] {
  const captures = callbackContextWrapperCaptures(wrapper)
  const contextTypeName = callbackContextWrapperContextTypeName(wrapper)
  const finalizerName = callbackContextWrapperFinalizerName(wrapper)
  const lines = [
    'static void ' + finalizerName + '(void* context) {',
    '  if (context == 0) return;',
    '  ' + contextTypeName + '* captured = (' + contextTypeName + '*)context;'
  ]

  for (let index = 0; index < captures.length; index = index + 1) {
    const capture = captures[index]
    if (isSharedMutableRuntimeArrowCapture(capture)) {
      const boxKind = mutableRuntimeArrowCaptureBoxKind(capture)
      lines.push('  inox_shared_' + boxKind + '_box_release(captured->' + emitRuntimeArrowCaptureField(capture) + ');')
    } else if (isRetainedRuntimeArrowCapture(capture)) {
      lines.push('  inox_release(captured->' + emitRuntimeArrowCaptureField(capture) + ');')
    }
  }

  for (let index = 0; index < captures.length; index = index + 1) {
    const capture = captures[index]
    if (isAsyncResultSettlementRuntimeArrowCapture(capture)) {
      const field = emitRuntimeArrowCaptureField(capture)
      const destructor = callbackCppDestructorName(capture.asyncResultSettlementCppType)

      if (destructor !== null) {
        lines.push('  captured->' + field + '.~' + destructor + '();')
      }
    }
  }

  lines.push('  inox_default_free(0, context, sizeof(' + contextTypeName + '), _Alignof(' + contextTypeName + '));')
  lines.push('}')

  return lines
}

function emitRuntimeArrowCallbackWrapperDeclaration(
  wrapper: CRuntimeArrowCallbackWrapper,
  baseContext: CallbackEmitContext,
  deps: CallbackLoweringDependencies
): string[] {
  if (wrapper.functionType.returnType === 'async-result') {
    return emitRuntimeAsyncArrowCallbackWrapperDeclaration(wrapper, baseContext, deps)
  }

  const lines: string[] = []

  if (isRuntimeArrowCallbackWrapperWithContext(wrapper)) {
    pushLines(lines, emitRuntimeArrowCallbackContextFinalizerDeclaration(wrapper))
    lines.push('')
  }

  const context = deps.createFunctionContext(baseContext, 'void', wrapper.functionType.returnNullable === true)
  context.cleanupEnabled = false
  context.statusReturn = true
  context.runtimeCallbackReturnType = wrapper.functionType.returnType
  if (wrapper.functionType.returnShape !== null && typeof wrapper.functionType.returnShape !== 'undefined') {
    context.runtimeCallbackReturnShape = wrapper.functionType.returnShape
  } else {
    context.runtimeCallbackReturnShape = null
  }
  context.runtimeCallbackReturnOut = '(*inox_callback_out)'
  context.runtimeCallbackCleanupLabel = 'inox_callback_cleanup'
  const bodyLines: string[] = []

  pushLines(bodyLines, emitRuntimeArrowCallbackContextLocals(wrapper, context, deps))
  pushLines(bodyLines, emitRuntimeArrowCallbackParamPrelude(wrapper, context, deps))
  const statementLines =
    wrapper.expression.async === true
      ? emitRuntimeArrowCoroutineStartLines(wrapper, context)
      : emitRuntimeArrowCallbackStatementLines(wrapper, context, deps)

  lines.push(emitRuntimeCallbackWrapperHead(wrapper) + ' {')

  if (isRuntimeArrowCallbackWrapperWithContext(wrapper)) {
    lines.push('  if (inox_context == 0) return INOX_ERR_TYPE;')
  } else {
    lines.push('  (void)inox_context;')
  }

  lines.push(emitIndentedRuntimeArgCountCheck(wrapper.functionType.params))
  pushLines(lines, emitIndentedRuntimeArgsPadding(wrapper.functionType.params))
  lines.push('  *inox_callback_out = inox_undefined_value();')
  pushIndentedLines(lines, bodyLines)
  pushIndentedLines(lines, deps.emitLoopFlowDeclarations(context))
  pushIndentedLines(lines, deps.emitReturnFlowDeclarations(context))
  pushIndentedLines(lines, deps.emitOwnedValueDeclarations(context))
  pushIndentedLines(lines, deps.emitErrorChannelDeclarations(context))
  pushIndentedLines(lines, deps.emitBoxedValueDeclarations(context))
  if (context.usedRuntimeCallbackCleanupGoto === true) {
    lines.push('  {')
    for (const line of statementLines) {
      lines.push(`    ${line}`)
    }
    lines.push('  }')
    lines.push(`${context.runtimeCallbackCleanupLabel}:`)
  } else {
    pushIndentedLines(lines, statementLines)
  }
  pushIndentedLines(lines, deps.emitOwnedValueCleanup(context))
  pushIndentedLines(lines, deps.emitBoxedValueCleanup(context))
  lines.push('  return INOX_OK;')
  lines.push('}')

  return lines
}

function emitRuntimeAsyncArrowCallbackWrapperDeclaration(
  wrapper: CRuntimeArrowCallbackWrapper,
  baseContext: CallbackEmitContext,
  deps: CallbackLoweringDependencies
): string[] {
  const lines: string[] = []

  if (isRuntimeArrowCallbackWrapperWithContext(wrapper)) {
    pushLines(lines, emitRuntimeArrowCallbackContextFinalizerDeclaration(wrapper))
    lines.push('')
  }

  const context = deps.createFunctionContext(baseContext, 'void', false)
  context.cleanupEnabled = false
  context.statusReturn = true
  const bodyLines: string[] = []
  pushLines(bodyLines, emitRuntimeArrowCallbackContextLocals(wrapper, context, deps))
  pushLines(bodyLines, emitRuntimeArrowCallbackParamPrelude(wrapper, context, deps))
  const providerCppType = compilerLibraryIntrinsicNativeCppType(
    resolveCCompilerLibrarySet(context.libraries),
    'async-result'
  )
  const args = runtimeArrowCoroutineArgs(wrapper)

  lines.push(emitRuntimeCallbackWrapperHead(wrapper) + ' {')

  if (isRuntimeArrowCallbackWrapperWithContext(wrapper)) {
    lines.push('  if (inox_context == 0) return INOX_ERR_TYPE;')
  } else {
    lines.push('  (void)inox_context;')
  }

  lines.push(emitIndentedRuntimeArgCountCheck(wrapper.functionType.params))
  pushLines(lines, emitIndentedRuntimeArgsPadding(wrapper.functionType.params))
  pushIndentedLines(lines, bodyLines)

  if (providerCppType === null || providerCppType.length === 0) {
    lines.push('  return INOX_ERR_TYPE;')
    lines.push('}')
    return lines
  }

  lines.push(`  ${providerCppType}& inox_async_callback_out = *static_cast<${providerCppType}*>(inox_callback_out);`)
  lines.push('  inox_async_callback_out = {};')
  lines.push(`  inox_async_callback_out = ${wrapper.name}_coroutine(${joinStrings(args, ', ')});`)
  lines.push(
    `  return ${compilerLibraryIntrinsicAsyncResultCValidExpression(
      resolveCCompilerLibrarySet(context.libraries),
      'inox_async_callback_out'
    )} ? INOX_OK : INOX_ERR_TYPE;`
  )
  lines.push('}')

  return lines
}

function emitRuntimeArrowCoroutineStartLines(
  wrapper: CRuntimeArrowCallbackWrapper,
  context: CallbackFunctionContext
): string[] {
  const providerCppType = compilerLibraryIntrinsicNativeCppType(
    resolveCCompilerLibrarySet(context.libraries),
    'async-result'
  )

  if (providerCppType === null || providerCppType.length === 0) {
    return ['return INOX_ERR_TYPE;']
  }

  const args = runtimeArrowCoroutineArgs(wrapper)

  return [
    `${providerCppType} inox_async_callback_result = ${wrapper.name}_coroutine(${joinStrings(args, ', ')});`,
    `if (!(${compilerLibraryIntrinsicAsyncResultCValidExpression(
      resolveCCompilerLibrarySet(context.libraries),
      'inox_async_callback_result'
    )})) return INOX_ERR_TYPE;`
  ]
}

function runtimeArrowCoroutineArgs(wrapper: CRuntimeArrowCallbackWrapper): string[] {
  const args: string[] = []

  for (let index = 0; index < wrapper.functionType.params.length; index = index + 1) {
    const param = wrapper.functionType.params[index]
    const nativeCppType = libraryNativeBoundaryCppType(
      param.valueType,
      param.nullable === true,
      param.optional === true,
      param.shape
    )

    if (nativeCppType !== null || !isManagedRuntimeCallbackParamValueType(param.valueType)) {
      args.push(emitCIdentifier(runtimeArrowCallbackParamName(wrapper, index)))
    } else {
      args.push(`inox::Value(${runtimeCallbackArg(index)})`)
    }
  }

  for (const capture of wrapper.captures) {
    if (capture.mutable === true && isPlainCallbackParamValueType(capture.valueType)) {
      args.push(`inox::SharedNumberBox(${capture.name})`)
    } else if (capture.mutable === true && isManagedRuntimeCallbackParamValueType(capture.valueType)) {
      args.push(`inox::SharedValueBox(${capture.name})`)
    } else if (isRetainedRuntimeArrowCapture(capture)) {
      const retainedValue = `inox::Value(captured->${emitRuntimeArrowCaptureField(capture)})`
      const nativeCppType = libraryNativeBoundaryCppType(capture.valueType, false, false, capture.shape)
      args.push(nativeCppType === null ? retainedValue : `${nativeCppType}(${retainedValue})`)
    } else {
      args.push(capture.name)
    }
  }

  return args
}

function emitRuntimeArrowCallbackStatementLines(
  wrapper: CRuntimeArrowCallbackWrapper,
  context: CallbackFunctionContext,
  deps: CallbackLoweringDependencies
): string[] {
  if (wrapper.functionType.returnType === 'number' || wrapper.functionType.returnType === 'boolean') {
    if (!wrapper.expression.expressionBody) {
      return deps.emitStatementList(callbackBlockStatements(wrapper.expression.body), context)
    }

    const value = deps.emitPreparedNumberExpression(wrapper.expression.body, context)
    let expression = `inox_bool_value((${value.expression}) != 0)`

    if (wrapper.functionType.returnType === 'number') {
      expression = `inox_number_value(${value.expression})`
    }

    const lines: string[] = []
    pushLines(lines, value.lines)
    lines.push(`*inox_callback_out = ${expression};`)

    return lines
  }

  if (isManagedRuntimeReturnType(wrapper.functionType.returnType)) {
    if (!wrapper.expression.expressionBody) {
      return deps.emitStatementList(callbackBlockStatements(wrapper.expression.body), context)
    }

    return deps.emitRuntimeCallbackRuntimeValueReturnLines(wrapper.expression.body, context)
  }

  let statements = callbackBlockStatements(wrapper.expression.body)

  if (wrapper.expression.expressionBody) {
    statements = [
      {
        type: 'ExpressionStatement',
        expression: wrapper.expression.body
      }
    ]
  }

  return deps.emitStatementList(statements, context)
}

export function emitRuntimeArrowCallbackContextLocals(
  wrapper: CCallbackContextWrapper,
  context: CallbackFunctionContext,
  deps: CallbackLoweringDependencies,
  contextParameterName: string = 'inox_context'
): string[] {
  if (!hasRuntimeArrowCallbackContext(wrapper)) {
    return []
  }

  const captures = callbackContextWrapperCaptures(wrapper)
  const contextTypeName = callbackContextWrapperContextTypeName(wrapper)
  const lines = [contextTypeName + '* captured = (' + contextTypeName + '*)' + contextParameterName + ';']

  if (callbackContextWrapperNeedsEventLoop(wrapper)) {
    context.eventLoopUsed = true
    context.externalEventLoop = true
    context.explicitEventLoop = true
    lines.push('if (captured->inox_loop == 0) return INOX_ERR_TYPE;')
    lines.push('inox_loop* inox_loop = captured->inox_loop;')
  }

  for (let index = 0; index < captures.length; index = index + 1) {
    const capture = captures[index]
    context.localValueNames.add(capture.name)
    context.cppValueTypes.delete(capture.name)

    if (capture.valueType === 'asyncResult-settlement') {
      let kind: 'reject' | 'fulfill' = 'fulfill'

      if (capture.asyncResultSettlementKind !== null && typeof capture.asyncResultSettlementKind !== 'undefined') {
        kind = capture.asyncResultSettlementKind
      }

      context.asyncResultConstructorHandlers.set(capture.name, {
        cExpression: capture.asyncResultSettlementCExpression ?? '',
        kind: kind,
        asyncResult: 'captured->' + emitRuntimeArrowCaptureField(capture)
      })
      continue
    }

    context.variables.set(capture.name, capture.valueType)

    if (capture.valueType === 'function') {
      context.runtimeCallbacks.add(capture.name)
    }

    if (isSupportedMutableRuntimeArrowCapture(capture, context)) {
      context.boxedVariables.add(capture.name)

      if (capture.valueType === 'object') {
        deps.registerObjectShape(context, capture.name, capture.shape)
      }

      lines.push(
        emitRuntimeArrowCaptureCType(capture) +
          ' ' +
          capture.name +
          ' = captured->' +
          emitRuntimeArrowCaptureField(capture) +
          ';'
      )
      continue
    }

    if (isRetainedRuntimeArrowCapture(capture)) {
      if (capture.valueType === 'string') {
        context.runtimeStrings.add(capture.name)
        lines.push(
          'inox_string* ' +
            capture.name +
            ' = (inox_string*)captured->' +
            emitRuntimeArrowCaptureField(capture) +
            '.as.ref;'
        )
        continue
      }

      if (capture.valueType === 'object') {
        deps.registerObjectShape(context, capture.name, capture.shape)
        lines.push('inox_value ' + capture.name + ' = captured->' + emitRuntimeArrowCaptureField(capture) + ';')
        continue
      }
    }

    lines.push(
      emitRuntimeArrowCaptureCType(capture) +
        ' ' +
        capture.name +
        ' = captured->' +
        emitRuntimeArrowCaptureField(capture) +
        ';'
    )
  }

  return lines
}

function emitRuntimeArrowCallbackParamPrelude(
  wrapper: CRuntimeArrowCallbackWrapper,
  context: CallbackFunctionContext,
  deps: CallbackLoweringDependencies
): string[] {
  const lines: string[] = []
  let index = 0

  for (const param of wrapper.functionType.params) {
    const name = runtimeArrowCallbackParamName(wrapper, index)
    const cName = emitCIdentifier(name)
    const value = runtimeCallbackArg(index)

    pushLines(lines, emitRuntimeCallbackWrapperArgChecks(param, index, context.libraries))
    context.variables.set(name, param.valueType)

    if ((param.nullable === true || param.optional === true) && isNullableScalarType(param.valueType)) {
      context.nullableVariables?.add(name)
    }

    const nativeCppType = libraryNativeBoundaryCppType(
      param.valueType,
      param.nullable === true,
      param.optional === true,
      param.shape
    )

    if (nativeCppType !== null) {
      context.cppValueTypes.set(name, nativeCppType)
      lines.push(
        `${nativeCppType} ${cName} = ${applyLibraryNativeValueAdapter(value, libraryNativeValueAdapter(param.shape))};`
      )
      index = index + 1
      continue
    }

    if ((param.nullable === true || param.optional === true) && isNullableScalarType(param.valueType)) {
      lines.push(`inox_value ${cName} = ${value};`)
      index = index + 1
      continue
    }

    if (param.valueType === 'string') {
      context.runtimeStrings.add(name)
      lines.push(`inox_string* ${cName} = (inox_string*)${value}.as.ref;`)
      index = index + 1
      continue
    }

    if (param.valueType === 'object') {
      deps.registerObjectShape(context, name, param.shape)
      lines.push(`inox_value ${cName} = ${value};`)
      index = index + 1
      continue
    }

    if (param.valueType === 'bytes') {
      lines.push(`inox_value ${cName} = ${value};`)
      index = index + 1
      continue
    }

    if (param.valueType === 'function') {
      context.runtimeCallbacks.add(name)
      context.functionTypes.set(name, normalizeFunctionType(param.functionType))
      lines.push(`inox_value ${cName} = ${value};`)
      index = index + 1
      continue
    }

    if (param.valueType === 'unknown') {
      lines.push(`inox_value ${cName} = ${value};`)
      index = index + 1
      continue
    }

    if (param.valueType === 'number') {
      lines.push(`double ${cName} = ${value}.as.number;`)
      index = index + 1
      continue
    }

    if (param.valueType === 'boolean') {
      lines.push(`double ${cName} = ${value}.as.boolean ? 1 : 0;`)
    }

    index = index + 1
  }

  return lines
}

function runtimeArrowCallbackParamName(wrapper: CRuntimeArrowCallbackWrapper, index: number): string {
  const params = callbackArrowParams(wrapper.expression)
  const param = params[index] ?? null

  if (param !== null && typeof param !== 'undefined') {
    return param.name
  }

  return `inox_arg_${index}`
}

export function emitRuntimeArrowCaptureCType(capture: CRuntimeArrowCapture): string {
  if (capture.mutable) {
    if (isPlainCallbackParamValueType(capture.valueType)) {
      return 'inox_shared_number_box*'
    }

    if (isManagedRuntimeCallbackParamValueType(capture.valueType)) {
      return 'inox_shared_value_box*'
    }
  }

  if (isRetainedRuntimeArrowCapture(capture)) {
    return 'inox_value'
  }

  if (capture.valueType === 'asyncResult-settlement') {
    return capture.asyncResultSettlementCppType ?? 'inox::Value'
  }

  if (capture.valueType === 'string') {
    return 'const char*'
  }

  return 'double'
}

export function emitRuntimeArrowCaptureField(capture: CRuntimeArrowCapture): string {
  return emitCIdentifier(capture.name)
}

export function isRetainedRuntimeArrowCapture(capture: CRuntimeArrowCapture): boolean {
  return (
    capture.runtimeManaged === true && isManagedRuntimeCallbackParamValueType(capture.valueType) && !capture.mutable
  )
}

function isSharedMutableRuntimeArrowCapture(capture: CRuntimeArrowCapture): boolean {
  return capture.mutable === true && isSupportedRuntimeCallbackParamValueType(capture.valueType)
}

function mutableRuntimeArrowCaptureBoxKind(capture: CRuntimeArrowCapture): 'number' | 'value' {
  return isPlainCallbackParamValueType(capture.valueType) ? 'number' : 'value'
}

export function isAsyncResultSettlementRuntimeArrowCapture(capture: CRuntimeArrowCapture): boolean {
  return capture.valueType === 'asyncResult-settlement'
}

function callbackCppDestructorName(cppType: string | null | undefined): string | null {
  if (cppType === null || typeof cppType === 'undefined' || cppType.length === 0) {
    return null
  }

  const separator = cppType.lastIndexOf('::')
  return separator < 0 ? cppType : cppType.slice(separator + 2)
}

export function isSupportedMutableRuntimeArrowCapture(
  capture: CRuntimeArrowCapture,
  context: CallbackFunctionContext
): boolean {
  if (capture.mutable !== true) {
    return false
  }

  if (!isSupportedRuntimeCallbackParamValueType(capture.valueType)) {
    return false
  }

  const declaration = capture.declaration

  if (declaration === null || typeof declaration === 'undefined') {
    return false
  }

  return context.boxedMutableCaptureDeclarations.has(declaration)
}

function emitRuntimeCallbackWrapperArgChecks(
  param: CFunctionParam,
  index: number,
  libraries: CCompilerLibrarySet | null | undefined
): string[] {
  const omittable = runtimeCallbackParamIsOmittable(param)
  const nativeValidExpression = compilerLibraryNativeRuntimeValueValidExpressionForTypeRef(libraries, param.typeRef)
  const value = runtimeCallbackArg(index)

  if (nativeValidExpression !== null) {
    const valid = nativeValidExpression.split('$value').join(value)
    let mismatch = `!(${valid})`

    if (param.nullable === true) {
      mismatch = `${value}.tag != INOX_TAG_NULL && ${mismatch}`
    }

    if (omittable) {
      mismatch = `${value}.tag != INOX_TAG_UNDEFINED && ${mismatch}`
    }

    return [`if (${mismatch}) return INOX_ERR_TYPE;`]
  }

  if (omittable && param.valueType === 'string') {
    const nullCheck = param.nullable === true ? `${value}.tag != INOX_TAG_NULL && ` : ''
    return [
      `if (${value}.tag != INOX_TAG_UNDEFINED && ${nullCheck}` +
        `(${value}.tag != INOX_TAG_STRING || ${value}.as.ref == 0)) return INOX_ERR_TYPE;`
    ]
  }

  if (omittable && param.valueType === 'object') {
    const nullCheck = param.nullable === true ? `${value}.tag != INOX_TAG_NULL && ` : ''
    return [
      `if (${value}.tag != INOX_TAG_UNDEFINED && ${nullCheck}` +
        `(${runtimeObjectLikeValueMismatchCondition(value)})) return INOX_ERR_TYPE;`
    ]
  }

  if (omittable && param.valueType === 'bytes') {
    const nullCheck = param.nullable === true ? `${value}.tag != INOX_TAG_NULL && ` : ''
    return [
      `if (${value}.tag != INOX_TAG_UNDEFINED && ${nullCheck}` +
        `(${value}.tag != INOX_TAG_BYTES || ${value}.as.ref == 0)) return INOX_ERR_TYPE;`
    ]
  }

  if (omittable && param.valueType === 'function') {
    return [
      `if (${value}.tag != INOX_TAG_UNDEFINED && ` +
        `(${value}.tag != INOX_TAG_FUNCTION || ${value}.as.ref == 0)) return INOX_ERR_TYPE;`
    ]
  }

  if (param.valueType === 'function') {
    return [`if (${value}.tag != INOX_TAG_FUNCTION || ${value}.as.ref == 0) return INOX_ERR_TYPE;`]
  }

  if (omittable && isNullableScalarType(param.valueType)) {
    const tag = cRuntimeValueTag(param.valueType)
    const nullCheck = param.nullable === true ? `${value}.tag != INOX_TAG_NULL && ` : ''

    if (tag !== null && typeof tag !== 'undefined') {
      return [`if (${value}.tag != INOX_TAG_UNDEFINED && ${nullCheck}${value}.tag != ${tag}) return INOX_ERR_TYPE;`]
    }
  }

  if (param.nullable === true && param.valueType === 'string') {
    return [
      `if (${value}.tag != INOX_TAG_NULL && ` +
        `(${value}.tag != INOX_TAG_STRING || ${value}.as.ref == 0)) return INOX_ERR_TYPE;`
    ]
  }

  if (param.nullable === true && param.valueType === 'object') {
    return [
      `if (${value}.tag != INOX_TAG_NULL && ` +
        `(${runtimeObjectLikeValueMismatchCondition(value)})) return INOX_ERR_TYPE;`
    ]
  }

  if (param.nullable === true && param.valueType === 'bytes') {
    return [
      `if (${value}.tag != INOX_TAG_NULL && ` +
        `(${value}.tag != INOX_TAG_BYTES || ${value}.as.ref == 0)) return INOX_ERR_TYPE;`
    ]
  }

  if (param.nullable === true && isNullableScalarType(param.valueType)) {
    const tag = cRuntimeValueTag(param.valueType)

    if (tag !== null && typeof tag !== 'undefined') {
      return [`if (${value}.tag != INOX_TAG_NULL && ${value}.tag != ${tag}) return INOX_ERR_TYPE;`]
    }
  }

  if (param.valueType === 'string') {
    return [`if (${value}.tag != INOX_TAG_STRING || ${value}.as.ref == 0) return INOX_ERR_TYPE;`]
  }

  if (param.valueType === 'object') {
    return [`if (${runtimeObjectLikeValueMismatchCondition(value)}) return INOX_ERR_TYPE;`]
  }

  if (param.valueType === 'bytes') {
    return [`if (${value}.tag != INOX_TAG_BYTES || ${value}.as.ref == 0) return INOX_ERR_TYPE;`]
  }

  if (param.valueType === 'number') {
    return [`if (${value}.tag != INOX_TAG_NUMBER) return INOX_ERR_TYPE;`]
  }

  if (param.valueType === 'boolean') {
    return [`if (${value}.tag != INOX_TAG_BOOL) return INOX_ERR_TYPE;`]
  }

  return []
}

function emitRuntimeCallbackWrapperArg(param: CFunctionParam, index: number): string {
  const value = runtimeCallbackArg(index)

  if (isLibraryNativeRuntimeCallbackParam(param)) {
    return applyLibraryNativeValueAdapter(value, libraryNativeValueAdapter(param.shape))
  }

  if ((param.nullable === true || param.optional === true) && isNullableScalarType(param.valueType)) {
    return value
  }

  if (param.valueType === 'number') {
    return `${value}.as.number`
  }

  if (param.valueType === 'boolean') {
    return `(${value}.as.boolean ? 1 : 0)`
  }

  return value
}

function runtimeCallbackArg(index: number): string {
  return `${runtimeCallbackArgsName}[${index}]`
}

export function emitFunctionPointerReturnType(functionType: CFunctionType | null | undefined): string {
  if (functionType !== null && typeof functionType !== 'undefined') {
    return emitCReturnType(functionType.returnType, functionType.returnNullable === true, functionType.returnShape)
  }

  return emitCType('void')
}

export function functionPointerNativeReturnRuntimeValueExpression(
  functionType: CFunctionType,
  targetFunctionType: CFunctionType | null | undefined,
  libraries: CCompilerLibrarySet,
  value: string
): string | null {
  if (
    targetFunctionType === null ||
    typeof targetFunctionType === 'undefined' ||
    emitFunctionPointerReturnType(functionType) !== 'inox_value' ||
    emitFunctionPointerReturnType(targetFunctionType) === 'inox_value'
  ) {
    return null
  }

  let expression = compilerLibraryNativeRuntimeValueExpressionForTypeRef(libraries, targetFunctionType.returnTypeRef)

  if (expression === null) {
    const returnTypeId = targetFunctionType.returnShape?.libraryTypeId

    if (returnTypeId !== null && typeof returnTypeId !== 'undefined' && returnTypeId !== '') {
      expression = compilerLibraryNativeRuntimeValueExpressionForId(libraries, returnTypeId)
    }
  }

  if (expression === null) {
    return null
  }

  return expression.split('$value').join(value)
}

export function emitFunctionPointerAdapterResultLines(
  functionType: CFunctionType,
  targetFunctionType: CFunctionType | null | undefined,
  libraries: CCompilerLibrarySet,
  call: string,
  cleanupLines: string[],
  diagnostics: Diagnostic[]
): string[] {
  const lines: string[] = []
  const adapterReturnType = emitFunctionPointerReturnType(functionType)

  if (adapterReturnType === 'void') {
    lines.push(`  ${call};`)
    pushCallbackLines(lines, cleanupLines)

    return lines
  }

  const targetReturnType = emitFunctionPointerReturnType(targetFunctionType)

  if (adapterReturnType === 'inox_value' && targetReturnType !== 'inox_value') {
    if (isRuntimeRaiiCppType(targetReturnType)) {
      lines.push(`  auto inox_adapter_result = ${call};`)
      pushCallbackLines(lines, cleanupLines)
      lines.push('  return inox_adapter_result.release();')

      return lines
    }

    const expression = functionPointerNativeReturnRuntimeValueExpression(
      functionType,
      targetFunctionType,
      libraries,
      'inox_native_adapter_result'
    )

    if (expression === null) {
      diagnostics.push(
        diagnostic(
          'INOX_C_FUNCTION_VALUE',
          'converting a native function result to a runtime value requires a registered runtime-value expression'
        )
      )
      pushCallbackLines(lines, cleanupLines)
      lines.push('  return inox_undefined_value();')

      return lines
    }

    lines.push(`  auto inox_native_adapter_result = ${call};`)
    lines.push(`  inox_value inox_adapter_result = ${expression};`)
    lines.push('  inox_retain(inox_adapter_result);')
    pushCallbackLines(lines, cleanupLines)
    lines.push('  return inox_adapter_result;')

    return lines
  }

  if (cleanupLines.length === 0) {
    lines.push(`  return ${call};`)

    return lines
  }

  lines.push(`  ${adapterReturnType} inox_adapter_result = ${call};`)
  pushCallbackLines(lines, cleanupLines)
  lines.push('  return inox_adapter_result;')

  return lines
}

function isRuntimeRaiiCppType(cppType: string): boolean {
  return cppType === 'inox::String' || cppType === 'inox::ObjectValue' || cppType === 'inox::Value'
}

function pushCallbackLines(lines: string[], additions: string[]): void {
  for (const line of additions) {
    lines.push(line)
  }
}

export function emitFunctionPointerParams(
  functionType: CFunctionType | null | undefined,
  seen: CObjectShape[] = [],
  seenTypes: string[] = []
): string {
  if (functionType === null || typeof functionType === 'undefined') {
    return 'void'
  }

  const params: string[] = []

  for (const param of functionType.params) {
    params.push(emitFunctionPointerParamCType(param))
  }

  if (params.length === 0) {
    return 'void'
  }

  return joinStrings(params, ', ')
}

export function emitFunctionPointerNamedParams(
  functionType: CFunctionType | null | undefined,
  seenTypes: string[] = []
): string {
  if (functionType === null || typeof functionType === 'undefined') {
    return 'void'
  }

  const params: string[] = []

  appendFunctionPointerNamedParams(params, functionType, seenTypes)

  if (params.length === 0) {
    return 'void'
  }

  return joinStrings(params, ', ')
}

export function collectFunctionPointerParamNames(
  functionType: CFunctionType | null | undefined,
  seenTypes: string[] = []
): string[] {
  const names: string[] = []

  if (functionType === null || typeof functionType === 'undefined') {
    return names
  }

  appendFunctionPointerParamNames(names, functionType, seenTypes)

  return names
}

export function collectFunctionPointerParamInfos(
  functionType: CFunctionType | null | undefined,
  seenTypes: string[] = []
): FunctionPointerParamInfo[] {
  const infos: FunctionPointerParamInfo[] = []

  if (functionType === null || typeof functionType === 'undefined') {
    return infos
  }

  appendFunctionPointerParamInfos(infos, functionType, seenTypes)

  return infos
}

export function collectObjectShapeFunctionPointerFieldInfos(
  rootName: string,
  shape: CObjectShape | null | undefined,
  seenTypes: string[] = []
): ObjectFunctionPointerFieldInfo[] {
  const infos: ObjectFunctionPointerFieldInfo[] = []

  appendObjectShapeFunctionPointerFieldInfos(infos, rootName, [], shape, [], seenTypes)

  return infos
}

export function emitFunctionPointerOutParameter(
  name: string,
  functionType: CFunctionType | null | undefined,
  seenTypes: string[] = []
): string {
  return `${emitFunctionPointerReturnType(functionType)} (**${name})(${emitFunctionPointerParams(
    functionType,
    [],
    seenTypes
  )})`
}

export function emitFunctionPointerNativeBoundaryArgument(
  paramName: string,
  value: string,
  expectedFunctionType: CFunctionType | null | undefined,
  targetFunctionType: CFunctionType | null | undefined
): string {
  const index = functionPointerRootParamIndex(paramName)

  if (
    index === null ||
    expectedFunctionType === null ||
    typeof expectedFunctionType === 'undefined' ||
    targetFunctionType === null ||
    typeof targetFunctionType === 'undefined' ||
    index >= expectedFunctionType.params.length ||
    index >= targetFunctionType.params.length
  ) {
    return value
  }

  const expectedParam = expectedFunctionType.params[index]
  const targetParam = targetFunctionType.params[index]

  if (
    expectedParam === null ||
    typeof expectedParam === 'undefined' ||
    targetParam === null ||
    typeof targetParam === 'undefined'
  ) {
    return value
  }

  const expectedCppType = libraryNativeBoundaryCppType(
    expectedParam.valueType,
    expectedParam.nullable === true,
    expectedParam.optional === true,
    expectedParam.shape
  )
  const targetCppType = libraryNativeBoundaryCppType(
    targetParam.valueType,
    targetParam.nullable === true,
    targetParam.optional === true,
    targetParam.shape
  )

  if (targetCppType === null || targetCppType === expectedCppType) {
    return value
  }

  return applyLibraryNativeValueAdapter(value, libraryNativeValueAdapter(targetParam.shape))
}

function functionPointerRootParamIndex(name: string): number | null {
  const prefix = 'inox_arg_'

  if (!name.startsWith(prefix)) {
    return null
  }

  let index = prefix.length
  let value = 0

  while (index < name.length) {
    const code = name.charCodeAt(index)

    if (code < 48 || code > 57) {
      return null
    }

    value = value * 10 + (code - 48)
    index = index + 1
  }

  if (index === prefix.length) {
    return null
  }

  return value
}

export function registerFunctionPointerRuntimeAdapter(
  functionType: CFunctionType,
  seenTypes: string[],
  context: FunctionPointerRuntimeAdapterContext
): CFunctionPointerRuntimeAdapter {
  const key = functionPointerRuntimeAdapterKey(functionType, seenTypes)
  const existing = context.functionPointerRuntimeAdapterNames.get(key)

  if (existing !== null && typeof existing !== 'undefined') {
    return existing
  }

  const index = context.functionPointerRuntimeAdapters.length
  const adapterSeenTypes: string[] = []

  for (const seenType of seenTypes) {
    adapterSeenTypes.push(seenType)
  }

  const adapter: CFunctionPointerRuntimeAdapter = {
    callbackName: `inox_function_pointer_runtime_callback_${index}`,
    contextTypeName: `inox_function_pointer_runtime_context_${index}`,
    finalizerName: `inox_function_pointer_runtime_finalize_${index}`,
    functionType,
    seenTypes: adapterSeenTypes
  }

  context.functionPointerRuntimeAdapterNames.set(key, adapter)
  context.functionPointerRuntimeAdapters.push(adapter)

  return adapter
}

function functionPointerRuntimeAdapterKey(functionType: CFunctionType, seenTypes: string[]): string {
  let key = `${functionType.returnType}:${functionType.returnNullable === true ? 'nullable' : 'required'}`

  for (const param of functionType.params) {
    key = `${key}:${param.valueType}:${param.nullable === true ? 'nullable' : 'required'}`
  }

  return `${key}:${emitFunctionPointerReturnType(functionType)}:${emitFunctionPointerParams(
    functionType,
    [],
    seenTypes
  )}`
}

function appendFunctionPointerNamedParams(params: string[], functionType: CFunctionType, seenTypes: string[]): void {
  let index = 0

  for (const param of functionType.params) {
    const name = `inox_arg_${index}`

    params.push(`${emitFunctionPointerParamCType(param)} ${name}`)

    index = index + 1
  }
}

function appendFunctionPointerParamNames(names: string[], functionType: CFunctionType, seenTypes: string[]): void {
  let index = 0

  for (const param of functionType.params) {
    const name = `inox_arg_${index}`

    names.push(name)

    index = index + 1
  }
}

function appendFunctionPointerParamInfos(
  infos: FunctionPointerParamInfo[],
  functionType: CFunctionType,
  seenTypes: string[]
): void {
  let index = 0

  for (const param of functionType.params) {
    const name = `inox_arg_${index}`

    infos.push({
      functionType: null,
      name,
      runtimeFunction: false,
      seenTypes: copyFunctionPointerSeenTypes(seenTypes)
    })

    index = index + 1
  }
}

export function collectFunctionPointerReturnCompanionInfos(
  _functionType: CFunctionType | null | undefined,
  _seenTypes: string[] = []
): ObjectFunctionPointerFieldInfo[] {
  return []
}

export function emitFunctionReturnCompanionOutName(path: string[]): string {
  let name = 'inox_outfn'

  for (const segment of path) {
    name = `${name}_${emitCIdentifier(segment)}`
  }

  return name
}

function emitFunctionPointerParamCType(param: CFunctionParam): string {
  const libraryCppType = libraryNativeBoundaryCppType(
    param.valueType,
    param.nullable === true,
    param.optional === true,
    param.shape
  )

  if (libraryCppType !== null) {
    return libraryCppType
  }

  if (isBoxedScalarParam(param)) {
    return 'inox_value'
  }

  return emitCType(param.valueType)
}

function appendObjectShapeFunctionPointerParamDeclarations(
  params: string[],
  objectName: string,
  shape: CObjectShape | null | undefined,
  seen: CObjectShape[],
  seenTypes: string[]
): void {
  if (shape === null || typeof shape === 'undefined' || shape.fields === null || typeof shape.fields === 'undefined') {
    return
  }

  for (const item of seen) {
    if (item === shape) {
      return
    }
  }

  seen.push(shape)

  for (const field of shape.fields) {
    if (field.valueType === 'function') {
      if (!isPlainObjectFunctionField(field, seenTypes) && !isRuntimeFunctionType(field.functionType)) {
        continue
      }

      params.push(emitPlainArrowObjectFunctionFieldParam(objectName, field, seenTypes))
    } else if (field.valueType === 'object') {
      const declaredType = objectShapeDeclaredType(field.valueType, field.declaredType, field.shape)

      if (seenTypesIncludeDeclaredType(seenTypes, declaredType)) {
        continue
      }

      const pushedTypes = pushSeenDeclaredType(seenTypes, declaredType)
      appendObjectShapeFunctionPointerParamDeclarations(
        params,
        `${objectName}_${field.name}`,
        field.shape,
        seen,
        seenTypes
      )
      popSeenDeclaredTypes(seenTypes, pushedTypes)
    }
  }

  seen.pop()
}

function appendObjectShapeFunctionPointerParamNames(
  names: string[],
  objectName: string,
  shape: CObjectShape | null | undefined,
  seen: CObjectShape[],
  seenTypes: string[]
): void {
  if (shape === null || typeof shape === 'undefined' || shape.fields === null || typeof shape.fields === 'undefined') {
    return
  }

  for (const item of seen) {
    if (item === shape) {
      return
    }
  }

  seen.push(shape)

  for (const field of shape.fields) {
    if (field.valueType === 'function') {
      if (!isPlainObjectFunctionField(field, seenTypes) && !isRuntimeFunctionType(field.functionType)) {
        continue
      }

      names.push(emitCObjectFunctionFieldName(objectName, field.name))
    } else if (field.valueType === 'object') {
      const declaredType = objectShapeDeclaredType(field.valueType, field.declaredType, field.shape)

      if (seenTypesIncludeDeclaredType(seenTypes, declaredType)) {
        continue
      }

      const pushedTypes = pushSeenDeclaredType(seenTypes, declaredType)
      appendObjectShapeFunctionPointerParamNames(names, `${objectName}_${field.name}`, field.shape, seen, seenTypes)
      popSeenDeclaredTypes(seenTypes, pushedTypes)
    }
  }

  seen.pop()
}

function appendObjectShapeFunctionPointerParamInfos(
  infos: FunctionPointerParamInfo[],
  objectName: string,
  shape: CObjectShape | null | undefined,
  seen: CObjectShape[],
  seenTypes: string[]
): void {
  if (shape === null || typeof shape === 'undefined' || shape.fields === null || typeof shape.fields === 'undefined') {
    return
  }

  for (const item of seen) {
    if (item === shape) {
      return
    }
  }

  seen.push(shape)

  for (const field of shape.fields) {
    if (field.valueType === 'function') {
      const plain = isPlainObjectFunctionField(field, seenTypes)
      const runtime = !plain && isRuntimeFunctionType(field.functionType)

      if (!plain && !runtime) {
        continue
      }

      infos.push({
        functionType: field.functionType ?? null,
        name: emitCObjectFunctionFieldName(objectName, field.name),
        runtimeFunction: runtime,
        seenTypes: copyFunctionPointerSeenTypes(seenTypes)
      })
    } else if (field.valueType === 'object') {
      const declaredType = objectShapeDeclaredType(field.valueType, field.declaredType, field.shape)

      if (seenTypesIncludeDeclaredType(seenTypes, declaredType)) {
        continue
      }

      const pushedTypes = pushSeenDeclaredType(seenTypes, declaredType)
      appendObjectShapeFunctionPointerParamInfos(infos, `${objectName}_${field.name}`, field.shape, seen, seenTypes)
      popSeenDeclaredTypes(seenTypes, pushedTypes)
    }
  }

  seen.pop()
}

function appendObjectShapeFunctionPointerFieldInfos(
  infos: ObjectFunctionPointerFieldInfo[],
  objectName: string,
  path: string[],
  shape: CObjectShape | null | undefined,
  seen: CObjectShape[],
  seenTypes: string[]
): void {
  if (shape === null || typeof shape === 'undefined' || shape.fields === null || typeof shape.fields === 'undefined') {
    return
  }

  for (const item of seen) {
    if (item === shape) {
      return
    }
  }

  seen.push(shape)

  for (const field of shape.fields) {
    const fieldPath = copyFunctionPointerPath(path, field.name)

    if (field.valueType === 'function') {
      const plain = isPlainObjectFunctionField(field, seenTypes)
      const runtime = !plain && isRuntimeFunctionType(field.functionType)

      if (!plain && !runtime) {
        continue
      }

      infos.push({
        functionType: field.functionType ?? null,
        name: emitCObjectFunctionFieldName(objectName, field.name),
        path: fieldPath,
        runtimeFunction: runtime,
        seenTypes: copyFunctionPointerSeenTypes(seenTypes)
      })
    } else if (field.valueType === 'object') {
      const declaredType = objectShapeDeclaredType(field.valueType, field.declaredType, field.shape)

      if (seenTypesIncludeDeclaredType(seenTypes, declaredType)) {
        continue
      }

      const pushedTypes = pushSeenDeclaredType(seenTypes, declaredType)
      appendObjectShapeFunctionPointerFieldInfos(
        infos,
        `${objectName}_${field.name}`,
        fieldPath,
        field.shape,
        seen,
        seenTypes
      )
      popSeenDeclaredTypes(seenTypes, pushedTypes)
    }
  }

  seen.pop()
}

function copyFunctionPointerPath(path: string[], fieldName: string): string[] {
  const copy: string[] = []

  for (const segment of path) {
    copy.push(segment)
  }

  copy.push(fieldName)
  return copy
}

function copyFunctionPointerSeenTypes(seenTypes: string[]): string[] {
  const copy: string[] = []

  for (const seenType of seenTypes) {
    copy.push(seenType)
  }

  return copy
}

function appendObjectShapeFunctionPointerParamTypes(
  params: string[],
  shape: CObjectShape | null | undefined,
  seen: CObjectShape[],
  seenTypes: string[]
): void {
  if (shape === null || typeof shape === 'undefined' || shape.fields === null || typeof shape.fields === 'undefined') {
    return
  }

  for (const item of seen) {
    if (item === shape) {
      return
    }
  }

  seen.push(shape)

  for (const field of shape.fields) {
    if (field.valueType === 'function') {
      if (!isPlainObjectFunctionField(field, seenTypes) && !isRuntimeFunctionType(field.functionType)) {
        continue
      }

      params.push(emitObjectFunctionFieldParamType(field, seen, seenTypes))
    } else if (field.valueType === 'object') {
      const declaredType = objectShapeDeclaredType(field.valueType, field.declaredType, field.shape)

      if (seenTypesIncludeDeclaredType(seenTypes, declaredType)) {
        continue
      }

      const pushedTypes = pushSeenDeclaredType(seenTypes, declaredType)
      appendObjectShapeFunctionPointerParamTypes(params, field.shape, seen, seenTypes)
      popSeenDeclaredTypes(seenTypes, pushedTypes)
    }
  }

  seen.pop()
}

function emitObjectFunctionFieldParamType(field: CObjectShapeField, seen: CObjectShape[], seenTypes: string[]): string {
  if (isRuntimeObjectFunctionField(field, seenTypes)) {
    return 'inox_value'
  }

  return `${emitFunctionPointerReturnType(field.functionType)} (*)(${emitFunctionPointerParams(
    field.functionType,
    seen,
    seenTypes
  )})`
}
