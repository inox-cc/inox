import { diagnostic } from '../../diagnostics.ts'
import { collectIrTopLevelNodesFromPrograms, irClassMethodEffectName } from '../../ir.ts'
import type { AnyNode as CNode, IrProgram, SourceLocation } from '../../types.ts'
import {
  collectFunctionPointerReturnCompanionInfos,
  emitFunctionReturnCompanionOutName,
  emitFunctionPointerOutParameter,
  emitFunctionPointerParams,
  emitFunctionPointerReturnType,
  isPlainObjectFunctionField,
  isPlainFunctionPointerType,
  isRuntimeFunctionType,
  normalizeFunctionType,
  resolveFunctionParameterRuntimeType
} from './async/callbacks.ts'
import { functionTakesEventLoopParam } from './async/async-results.ts'
import type { CEmitContextWithDependencies, CFunctionContextWithDependencies } from './context.ts'
import {
  createFunctionContext,
  emitBoxedValueCleanup,
  emitBoxedValueDeclarations,
  emitCleanupReturn,
  emitCoroutineReturnStatement,
  emitErrorChannelDeclarations,
  emitEventLoopCleanup,
  emitEventLoopDeclarations,
  emitEventLoopDrain,
  emitEventLoopInit,
  emitFailureStatement,
  emitLoopFlowDeclarations,
  emitMainReturnValueDeclarations,
  emitOwnedAsyncResultCleanup,
  emitOwnedAsyncResultDeclarations,
  emitOwnedValueCleanup,
  emitOwnedValueDeclarations,
  emitReturnFlowDeclarations,
  emitReturnValueDeclarations,
  emitRuntimeTypeCheck,
  emitStatusCheck,
  nextCName,
  registerBoxedValue,
  registerOwnedValue,
  replaceCleanupGotosWithReturn,
  shouldEmitCleanupLabel
} from './context.ts'
import {
  cStringLiteral,
  emitCFunctionName,
  emitCIdentifier,
  emitCObjectFunctionFieldName,
  utf8ByteLength
} from './identifiers.ts'
import { emitRuntimeNullableValueCheck, emitRuntimeValueCheck } from './runtime-values.ts'
import {
  runtimeTypeAlternativeValidExpressions,
  runtimeTypeAlternativesAreNullable
} from './runtime-type-alternatives.ts'
import type {
  CClassInfo,
  CFunctionParam,
  CFunctionType,
  CObjectShape,
  CObjectShapeField,
  CPreparedFunctionCompanion,
  CPreparedExpression as PreparedExpression
} from './types.ts'
import { cFunctionTypeValue } from './types.ts'
import {
  cFunctionTypeFromTypeRef,
  cRuntimeValueTag,
  cTypeRefNativeShape,
  compilerLibraryIntrinsicSequenceMaterialization,
  compilerLibraryNativeRuntimeValueExpressionForTypeRef,
  compilerLibraryNativeRuntimeValueValidExpressionForTypeRef,
  emitCObjectParamName,
  emitCReturnType,
  emitCScalarParamName,
  emitCStringParamName,
  emitCType,
  isBoxedScalarParam,
  isNullableScalarParam,
  isOpaqueRuntimeValueType,
  libraryNativeBoundaryCppType,
  libraryNativeCppType,
  managedRaiiReturnCppType,
  requireCompilerLibraryAsyncResultCppType
} from './value-types.ts'
import type { ClassLoweringDependencies } from './values/classes.ts'
import {
  classFieldUsesCppStringStorage,
  classFieldOptionalLibraryNativeCppType,
  classParamOptionalLibraryNativeCppType,
  classParamUsesCppStringStorage,
  classParamUsesCppValueStorage,
  cClassValueTypeName,
  emitCClassConstructorHead,
  emitCClassInfoMethodName,
  emitCClassInfoTypeName,
  emitCClassTypeNameForClassName,
  registerClassObjectShape
} from './values/classes.ts'
import type { NullableLoweringDependencies } from './values/nullable.ts'
import { registerObjectShape } from './values/objects.ts'
import type { StatementLoweringDependencies } from './values/statements.ts'
import type { StringLoweringDependencies } from './values/strings.ts'

type CEmitContext = CEmitContextWithDependencies<
  ClassLoweringDependencies,
  NullableLoweringDependencies,
  StatementLoweringDependencies,
  StringLoweringDependencies
>
type CFunctionContext = CFunctionContextWithDependencies<
  ClassLoweringDependencies,
  NullableLoweringDependencies,
  StatementLoweringDependencies,
  StringLoweringDependencies
>

type CSourceLocation = SourceLocation | null | undefined

type CDeclarationFunctionContext = CFunctionContext & {
  classInstanceTypes: Map<string, string>
  functionReturnShapes: Map<string, CObjectShape | null>
  returnShape?: CObjectShape | null
  variables: Map<string, string>
}

type CFunctionReturnInfo = {
  returnType: string
  returnNullable: boolean
}

type CBoxedFunctionParamContext = {
  boxedMutableCaptureDeclarations: Set<CNode>
}

type NativeClassConstructorInitializerPlan = {
  body: CNode[]
  initializers: Map<string, string>
}

type NativeClassConstructorInitializer = {
  field: string
  expression: string
}

export type CDeclarationEmissionDependencies = {
  emitPreparedNumberExpression: (expression: CNode, context: CFunctionContext) => PreparedExpression
  emitStatementList: (statements: CNode[], context: CFunctionContext) => string[]
}

function cBooleanValueIsTrue(value: boolean | null | undefined): boolean {
  if (value === null || typeof value === 'undefined') {
    return false
  }

  if (value) {
    return true
  }

  return false
}

function declarationNodeArray(value: unknown): CNode[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
}

export function resolveFunctionReturnType(name: string, fallback: string, context: CEmitContext): string {
  const returnType = context.functionReturnTypes.get(name)

  if (returnType !== null && typeof returnType !== 'undefined') {
    return returnType
  }

  return fallback
}

export function resolveFunctionReturnNullable(name: string, fallback: boolean, context: CEmitContext): boolean {
  if (context.functionReturnNullables.has(name)) {
    return cBooleanValueIsTrue(context.functionReturnNullables.get(name))
  }

  return fallback === true
}

export function resolveFunctionDeclarationParams(
  name: string,
  fallback: CFunctionParam[],
  context: CEmitContext
): CFunctionParam[] {
  const params = context.functionParams.get(name)

  if (params !== null && typeof params !== 'undefined') {
    return params
  }

  return fallback
}

function pushDeclarationLines(target: string[], lines: string[]): void {
  for (const line of lines) {
    target.push(line)
  }
}

function pushIndentedDeclarationLines(target: string[], lines: string[]): void {
  for (const line of lines) {
    if (line === '') {
      target.push('')
      continue
    }

    target.push(`  ${line}`)
  }
}

function pushScopedDeclarationBody(target: string[], lines: string[]): void {
  target.push('  {')
  pushIndentedDeclarationLines(target, lines)
  target.push('  }')
}

function declarationBodyEndsWith(lines: string[], statement: string): boolean {
  for (let index = lines.length - 1; index >= 0; index = index - 1) {
    const line = lines[index].trim()

    if (line !== '') {
      return line === statement
    }
  }

  return false
}

function declarationBodyEndsWithReturn(lines: string[]): boolean {
  for (let index = lines.length - 1; index >= 0; index = index - 1) {
    const line = lines[index].trim()

    if (line !== '') {
      return (line.startsWith('return ') || line.startsWith('co_return ')) && line.endsWith(';')
    }
  }

  return false
}

function emitCLocalName(name: string): string {
  return emitCIdentifier(name)
}

function joinDeclarationParams(params: string[]): string {
  let output = ''

  for (let index = 0; index < params.length; index = index + 1) {
    if (index === 0) {
      output = params[index]
    } else {
      output = `${output}, ${params[index]}`
    }
  }

  return output
}

function declarationParamList(params: string[]): string {
  return joinDeclarationParams(params)
}

function declarationTypeOrUnknown(value: string | null | undefined): string {
  if (value !== null && typeof value !== 'undefined') {
    return value
  }

  return 'unknown'
}

function declarationBoxedParamNode(statement: CNode, index: number, param: CFunctionParam): CFunctionParam {
  if (statement.params.length > index) {
    return statement.params[index]
  }

  return param
}

function isBoxedScalarParamValueType(valueType: string): boolean {
  if (valueType === 'number') {
    return true
  }

  return valueType === 'boolean'
}

function isBoxedRuntimeValueParamType(valueType: string): boolean {
  if (valueType === 'string') {
    return true
  }

  return valueType === 'object'
}

function isBoxedParamValueType(valueType: string): boolean {
  if (isBoxedScalarParamValueType(valueType)) {
    return true
  }

  return isBoxedRuntimeValueParamType(valueType)
}

function isBoxedFunctionParam(
  param: CFunctionParam,
  index: number,
  statement: CNode,
  context: CBoxedFunctionParamContext
): boolean {
  return context.boxedMutableCaptureDeclarations.has(declarationBoxedParamNode(statement, index, param))
}

export function emitFunctionDeclaration(
  statement: CNode,
  baseContext: CEmitContext,
  deps: CDeclarationEmissionDependencies
): string[] {
  const returnInfo = resolveCFunctionReturnInfo(statement, baseContext)
  const returnType = returnInfo.returnType
  const returnNullable = returnInfo.returnNullable
  const params = resolveFunctionDeclarationParams(statement.name, statement.params, baseContext)
  const context: CDeclarationFunctionContext = createFunctionContext(baseContext, returnType, returnNullable)
  context.coroutine = cBooleanValueIsTrue(statement.async)
  context.returnFunctionType = cFunctionTypeFromTypeRef(statement.returnTypeRef, context.libraries, statement.loc)
  context.returnShape = physicalReturnShape(statement, context.functionReturnShapes.get(statement.name), context)
  context.returnFunctionCompanions = functionReturnCompanions(
    context.returnShape,
    statement.declaredReturnType === null || typeof statement.declaredReturnType === 'undefined'
      ? null
      : statement.declaredReturnType,
    returnType
  )
  context.returnLibraryNative = hasPhysicalNativeReturn(statement, context)

  context.externalEventLoop = context.coroutine || functionTakesEventLoopParam(statement.name, context)
  if (returnType === 'void' && context.externalEventLoop && !context.coroutine) {
    context.cleanupEnabled = false
  }

  registerFunctionParamsInContext(statement, params, context)

  const bodyLines: string[] = []
  const lines: string[] = []

  pushIndentedDeclarationLines(bodyLines, emitRuntimeParamPreludeForParams(statement, params, context, deps))
  pushIndentedDeclarationLines(bodyLines, deps.emitStatementList(statement.body, context))
  pushIndentedDeclarationLines(bodyLines, emitEventLoopDrain(context))
  const needsCleanup = shouldEmitCleanupLabel(context)
  const directScalarReturn =
    context.returnNullable !== true && (context.returnType === 'number' || context.returnType === 'boolean')
  const directManagedReturn =
    !context.coroutine &&
    managedRaiiReturnCppType(context.returnType, context.returnNullable === true, context.returnShape) !== null
  const directValueReturn =
    !needsCleanup &&
    !context.returnFlowUsed &&
    context.returnFunctionCompanions.length === 0 &&
    (directScalarReturn || directManagedReturn)

  lines.push(`${emitFunctionHead(statement, context)} {`)
  if (!directValueReturn) {
    pushIndentedDeclarationLines(lines, emitReturnValueDeclarations(context))
  }
  pushIndentedDeclarationLines(lines, emitFunctionReturnCompanionPrelude(context.returnFunctionCompanions))
  pushIndentedDeclarationLines(lines, emitLoopFlowDeclarations(context))
  pushIndentedDeclarationLines(lines, emitReturnFlowDeclarations(context))
  pushIndentedDeclarationLines(lines, emitEventLoopDeclarations(context))
  pushIndentedDeclarationLines(lines, emitOwnedValueDeclarations(context))
  pushIndentedDeclarationLines(lines, emitOwnedAsyncResultDeclarations(context))
  pushIndentedDeclarationLines(lines, emitErrorChannelDeclarations(context))
  pushIndentedDeclarationLines(lines, emitBoxedValueDeclarations(context))
  pushIndentedDeclarationLines(lines, emitEventLoopInit(context))

  if (needsCleanup) {
    pushScopedDeclarationBody(lines, bodyLines)
    lines.push('cleanup:')
    pushIndentedDeclarationLines(lines, emitOwnedValueCleanup(context))
    pushIndentedDeclarationLines(lines, emitOwnedAsyncResultCleanup(context))
    pushIndentedDeclarationLines(lines, emitEventLoopCleanup(context))
    pushIndentedDeclarationLines(lines, emitBoxedValueCleanup(context))
    pushIndentedDeclarationLines(lines, emitCleanupReturn(context))
  } else {
    const returnStatement = context.coroutine
      ? emitCoroutineReturnStatement(context)
      : context.returnType === 'void'
        ? 'return;'
        : 'return inox_return;'
    let directReturnBody = replaceCleanupGotosWithReturn(bodyLines, returnStatement)

    if (directValueReturn) {
      directReturnBody = simplifyDirectValueReturnBody(directReturnBody, returnStatement)
    }

    if (context.coroutine) {
      pushDeclarationLines(lines, directReturnBody)
      if (directValueReturn && !declarationBodyEndsWithReturn(directReturnBody)) {
        lines.push('  co_return {};')
      } else if (!directValueReturn && !declarationBodyEndsWith(directReturnBody, returnStatement)) {
        lines.push(`  ${returnStatement}`)
      }
    } else if (context.returnType !== 'void') {
      pushDeclarationLines(lines, directReturnBody)
      if (directValueReturn && !declarationBodyEndsWithReturn(directReturnBody)) {
        lines.push('  return {};')
      } else if (!directValueReturn && !declarationBodyEndsWith(directReturnBody, returnStatement)) {
        lines.push(`  ${returnStatement}`)
      }
    } else {
      pushDeclarationLines(lines, directReturnBody)
    }
  }

  lines.push('}')

  return lines
}

function simplifyDirectValueReturnBody(lines: string[], returnStatement: string): string[] {
  const result: string[] = []

  for (let index = 0; index < lines.length; index = index + 1) {
    const line = lines[index]
    const trimmed = line.trim()
    const next = lines[index + 1]

    if (
      trimmed.startsWith('inox_return = ') &&
      trimmed.endsWith(';') &&
      next !== null &&
      typeof next !== 'undefined' &&
      next.trim() === returnStatement
    ) {
      const indent = line.slice(0, line.length - line.trimStart().length)
      const expression = trimmed.slice('inox_return = '.length, trimmed.length - 1)

      result.push(`${indent}${returnStatement.split('inox_return').join(expression)}`)
      index = index + 1
      continue
    }

    if (trimmed === returnStatement) {
      const indent = line.slice(0, line.length - line.trimStart().length)
      result.push(`${indent}${returnStatement.startsWith('co_return ') ? 'co_return {};' : 'return {};'}`)
      continue
    }

    if (line.endsWith(` ${returnStatement}`)) {
      const fallback = returnStatement.startsWith('co_return ') ? 'co_return {};' : 'return {};'
      result.push(`${line.slice(0, line.length - returnStatement.length)}${fallback}`)
      continue
    }

    result.push(line)
  }

  return result
}

function registerFunctionParamsInContext(
  statement: CNode,
  params: CFunctionParam[],
  context: CDeclarationFunctionContext
): void {
  for (let index = 0; index < params.length; index = index + 1) {
    const param = params[index]

    context.localValueNames.add(param.name)
    context.cppValueTypes.delete(param.name)
    context.objectShapes.delete(param.name)
    context.objectDeclaredTypes.delete(param.name)
    context.runtimeValueStorageNames.delete(param.name)
    registerFunctionParamObjectDeclaredType(context, param)

    if (registerCoroutineStorageParam(param, context)) {
      continue
    }

    if (isNullableScalarParam(param)) {
      context.nullableVariables.add(param.name)
    }

    const libraryCppType = libraryNativeParamCppType(param, context)
    const nativeClassParam = nativeClassParamName(param, context)

    if (libraryCppType !== null && param.valueType === 'async-result') {
      context.variables.set(param.name, 'async-result')
      context.asyncResultValueTypes.set(param.name, declarationTypeOrUnknown(param.asyncResultValueType))
    } else if (libraryCppType !== null) {
      context.variables.set(param.name, 'object')
      context.cppValueTypes.set(param.name, libraryCppType)
      registerObjectShape(context, param.name, physicalParamShape(param, context))
    } else if (nativeClassParam !== null && typeof nativeClassParam !== 'undefined') {
      context.variables.set(param.name, cClassValueTypeName(nativeClassParam))
      context.classInstanceTypes.set(param.name, nativeClassParam)
    } else if (isNullableScalarParam(param)) {
      context.variables.set(param.name, param.valueType)
    } else if (isBoxedFunctionParam(param, index, statement, context) && isBoxedParamValueType(param.valueType)) {
      context.variables.set(param.name, param.valueType)
      context.boxedVariables.add(param.name)
      registerBoxedValue(context, param.name, param.valueType)

      if (param.valueType === 'object') {
        registerObjectShape(context, param.name, physicalParamShape(param, context))
      }
    } else if (param.valueType === 'string') {
      context.variables.set(param.name, 'string')

      if (param.nullable !== true && !isNullableScalarParam(param)) {
        context.runtimeStrings.add(param.name)
        context.runtimeStringValues.set(param.name, emitCStringParamName(param.name))
      }
    } else if (param.valueType === 'object') {
      context.variables.set(param.name, 'object')
      registerObjectShape(context, param.name, physicalParamShape(param, context))
    } else if (param.valueType === 'async-result') {
      context.variables.set(param.name, 'async-result')
      context.asyncResultValueTypes.set(param.name, declarationTypeOrUnknown(param.asyncResultValueType))
    } else if (param.valueType === 'function') {
      const runtimeFunctionType = resolveFunctionParameterRuntimeType(statement.name, index, param, context)
      let functionType = param.functionType

      if (runtimeFunctionType !== null && typeof runtimeFunctionType !== 'undefined') {
        functionType = runtimeFunctionType
      }

      context.variables.set(param.name, 'function')
      context.functionTypes.set(param.name, normalizeFunctionType(functionType))

      if (param.nullable === true) {
        context.nullableVariables.add(param.name)
      }

      if (runtimeFunctionType !== null && typeof runtimeFunctionType !== 'undefined') {
        context.runtimeCallbacks.add(param.name)
      }
    } else if (param.valueType === 'unknown' || isOpaqueRuntimeValueType(param.valueType)) {
      context.variables.set(param.name, 'unknown')
      context.runtimeValueStorageNames.add(param.name)
    } else {
      context.variables.set(param.name, param.valueType)
    }
  }
}

function registerCoroutineStorageParam(
  param: CFunctionParam,
  context: CDeclarationFunctionContext
): boolean {
  const storageKind = param.coroutineStorageKind

  if (storageKind === null || typeof storageKind === 'undefined') {
    return false
  }

  context.variables.set(param.name, param.valueType)

  if (storageKind === 'boxed-number' || storageKind === 'boxed-value') {
    context.boxedVariables.add(param.name)
  }

  if (param.valueType === 'string') {
    context.runtimeStrings.add(param.name)
  } else if (param.valueType === 'object') {
    registerObjectShape(context, param.name, physicalParamShape(param, context))
  } else if (param.valueType === 'function') {
    context.runtimeCallbacks.add(param.name)
    context.functionTypes.set(param.name, normalizeFunctionType(param.functionType))
  }

  return true
}

function registerFunctionParamObjectDeclaredType(context: CDeclarationFunctionContext, param: CFunctionParam): void {
  const declaredType = param.declaredType ?? param.shape?.builtin

  if (declaredType !== null && typeof declaredType !== 'undefined' && declaredType !== '') {
    context.objectDeclaredTypes.set(param.name, declaredType)
  }
}

export function emitFunctionHead(statement: CNode, context: CEmitContext): string {
  const statementName: string = statement.name
  let name = context.functionNames.get(statementName)

  if (name === null || typeof name === 'undefined') {
    name = emitCFunctionName(statementName)
  }

  const returnInfo = resolveCFunctionReturnInfo(statement, context)
  const coroutine = cBooleanValueIsTrue(statement.async)
  const returnType = coroutine ? 'async-result' : returnInfo.returnType
  const returnNullable = coroutine ? false : returnInfo.returnNullable
  const functionParams = resolveFunctionDeclarationParams(statement.name, statement.params, context)
  const returnShape = coroutine
    ? null
    : physicalReturnShape(statement, context.functionReturnShapes.get(statement.name), context)
  const returnCompanions = functionReturnCompanions(
    returnShape,
    statement.declaredReturnType === null || typeof statement.declaredReturnType === 'undefined'
      ? null
      : statement.declaredReturnType,
    returnType
  )
  const params: string[] = []

  for (let index = 0; index < functionParams.length; index = index + 1) {
    pushFunctionHeadParam(params, functionParams[index], index, statement, context)
  }

  if (functionTakesEventLoopParam(statement.name, context) && context.explicitEventLoop === true) {
    params.unshift('inox_loop* inox_loop')
  }

  pushFunctionReturnCompanionParams(params, returnCompanions)

  const cppReturnType = coroutine
    ? requireCompilerLibraryAsyncResultCppType(context.libraries, statement.loc)
    : emitCReturnType(returnType, returnNullable, returnShape)

  return `${cppReturnType} ${name}(${declarationParamList(params)})`
}

function functionReturnCompanions(
  _shape: CObjectShape | null | undefined,
  _declaredReturnType: string | null,
  _returnType: string
): CPreparedFunctionCompanion[] {
  return []
}

function pushFunctionReturnCompanionParams(params: string[], companions: CPreparedFunctionCompanion[]): void {
  for (const companion of companions) {
    params.push(
      emitFunctionPointerOutParameter(
        companion.expression,
        cFunctionTypeValue(companion.functionType),
        companion.seenTypes
      )
    )
  }
}

function emitFunctionReturnCompanionPrelude(companions: CPreparedFunctionCompanion[]): string[] {
  const lines: string[] = []

  for (const companion of companions) {
    lines.push(`if (${companion.expression} != 0) *${companion.expression} = 0;`)
  }

  return lines
}

function pushFunctionHeadParam(
  params: string[],
  param: CFunctionParam,
  index: number,
  statement: CNode,
  context: CEmitContext
): void {
  params.push(emitFunctionHeadParam(param, index, statement, context))
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

function pushObjectShapeFunctionFieldParams(
  params: string[],
  objectName: string,
  shape: CObjectShape | null | undefined,
  context: CEmitContext,
  loc: CSourceLocation,
  seenTypes: string[]
): void {
  if (shape === null || typeof shape === 'undefined') {
    return
  }

  const fields = shape.fields

  if (fields === null || typeof fields === 'undefined') {
    return
  }

  for (const field of fields) {
    if (field.valueType === 'function') {
      if (!isPlainObjectFunctionField(field, seenTypes) && !isRuntimeFunctionType(field.functionType)) {
        continue
      }

      params.push(emitObjectFunctionFieldParam(objectName, field, context, loc, seenTypes))
    } else if (field.valueType === 'object') {
      if (seenTypesIncludeDeclaredType(seenTypes, field.declaredType)) {
        continue
      }

      const pushedTypes = pushSeenDeclaredType(seenTypes, field.declaredType)

      pushObjectShapeFunctionFieldParams(params, `${objectName}_${field.name}`, field.shape, context, loc, seenTypes)

      popSeenDeclaredTypes(seenTypes, pushedTypes)
    }
  }
}

function emitObjectFunctionFieldParam(
  objectName: string,
  field: CObjectShapeField,
  context: CEmitContext,
  loc: CSourceLocation,
  seenTypes: string[]
): string {
  const name = emitCObjectFunctionFieldName(objectName, field.name)

  if (field.functionStorage === 'pointer') {
    return emitFunctionPointerParameter(name, field.functionType, seenTypes)
  }

  return emitFunctionParameter(name, field.functionType, context, loc, seenTypes)
}

function emitFunctionHeadParam(param: CFunctionParam, index: number, statement: CNode, context: CEmitContext): string {
  if (param.coroutineStorageKind === 'boxed-number') {
    return `inox::SharedNumberBox ${emitCLocalName(param.name)}`
  }

  if (param.coroutineStorageKind === 'boxed-value') {
    return `inox::SharedValueBox ${emitCLocalName(param.name)}`
  }

  if (param.coroutineStorageKind === 'runtime-value') {
    return `inox::Value ${emitCoroutineStorageParamName(param)}`
  }

  const nativeClassDeclaration = emitNativeClassParamDeclaration(param, context)

  if (nativeClassDeclaration !== null) {
    return nativeClassDeclaration
  }

  const libraryCppType = libraryNativeParamCppType(param, context)

  if (libraryCppType !== null) {
    return `${libraryCppType} ${emitCLocalName(param.name)}`
  }

  if (isBoxedScalarParam(param)) {
    return `inox_value ${emitCScalarParamName(param.name)}`
  }

  if (param.valueType === 'string') {
    return `inox_value ${emitCStringParamName(param.name)}`
  }

  if (param.valueType === 'object') {
    if (isBoxedFunctionParam(param, index, statement, context)) {
      return `inox_value ${emitCObjectParamName(param.name)}`
    }

    return `inox_value ${emitCLocalName(param.name)}`
  }

  if (param.valueType === 'function') {
    if (resolveFunctionParameterRuntimeType(statement.name, index, param, context)) {
      return `inox_value ${emitCLocalName(param.name)}`
    }

    return emitFunctionParameter(param.name, param.functionType, context, param.loc)
  }

  if (isBoxedFunctionParam(param, index, statement, context) && isBoxedScalarParamValueType(param.valueType)) {
    return `${emitCType(param.valueType)} ${emitCScalarParamName(param.name)}`
  }

  return `${emitCType(param.valueType)} ${emitCLocalName(param.name)}`
}

export function emitClassMethodDeclaration(
  info: CClassInfo,
  method: CNode,
  baseContext: CEmitContext,
  deps: CDeclarationEmissionDependencies,
  inClass: boolean = false
): string[] {
  const context: CDeclarationFunctionContext = createFunctionContext(
    baseContext,
    method.returnType,
    method.returnNullable
  )
  context.returnFunctionType = cFunctionTypeFromTypeRef(method.returnTypeRef, context.libraries, method.loc)
  const params = method.params
  const methodEffectName = irClassMethodEffectName(info.name, method.name)

  context.returnShape = physicalReturnShape(method, method.returnShape, context)
  context.returnLibraryNative = hasPhysicalNativeReturn(method, context)
  context.externalEventLoop = functionTakesEventLoopParam(methodEffectName, baseContext)

  if (info.native) {
    context.variables.set('this', cClassValueTypeName(info.name))
  } else {
    context.variables.set('this', 'object')
    registerClassObjectShape(context, 'this', info)
  }

  context.classInstanceTypes.set('this', info.name)
  registerFunctionParamsInContext(method, params, context)

  const bodyLines: string[] = []
  const lines: string[] = []

  pushIndentedDeclarationLines(bodyLines, emitRuntimeParamPreludeForParams(method, params, context, deps))
  pushIndentedDeclarationLines(bodyLines, deps.emitStatementList(method.body, context))
  pushIndentedDeclarationLines(bodyLines, emitEventLoopDrain(context))

  const needsCleanup = shouldEmitCleanupLabel(context)

  lines.push(`${emitClassMethodHead(info, method, context, inClass)} {`)
  pushIndentedDeclarationLines(lines, emitReturnValueDeclarations(context))
  pushIndentedDeclarationLines(lines, emitLoopFlowDeclarations(context))
  pushIndentedDeclarationLines(lines, emitReturnFlowDeclarations(context))
  pushIndentedDeclarationLines(lines, emitEventLoopDeclarations(context))
  pushIndentedDeclarationLines(lines, emitOwnedValueDeclarations(context))
  pushIndentedDeclarationLines(lines, emitOwnedAsyncResultDeclarations(context))
  pushIndentedDeclarationLines(lines, emitErrorChannelDeclarations(context))
  pushIndentedDeclarationLines(lines, emitBoxedValueDeclarations(context))
  pushIndentedDeclarationLines(lines, emitEventLoopInit(context))

  if (needsCleanup) {
    pushScopedDeclarationBody(lines, bodyLines)
    lines.push('cleanup:')
    pushIndentedDeclarationLines(lines, emitOwnedValueCleanup(context))
    pushIndentedDeclarationLines(lines, emitOwnedAsyncResultCleanup(context))
    pushIndentedDeclarationLines(lines, emitEventLoopCleanup(context))
    pushIndentedDeclarationLines(lines, emitBoxedValueCleanup(context))
    pushIndentedDeclarationLines(lines, emitCleanupReturn(context))
  } else {
    const returnStatement = context.returnType === 'void' ? 'return;' : 'return inox_return;'
    const directReturnBody = replaceCleanupGotosWithReturn(bodyLines, returnStatement)

    if (context.returnType !== 'void') {
      pushDeclarationLines(lines, directReturnBody)
      if (!declarationBodyEndsWith(directReturnBody, returnStatement)) {
        lines.push(`  ${returnStatement}`)
      }
    } else {
      pushDeclarationLines(lines, directReturnBody)
    }
  }

  lines.push('}')

  return lines
}

export function emitClassConstructorDeclaration(
  info: CClassInfo,
  baseContext: CEmitContext,
  deps: CDeclarationEmissionDependencies,
  inClass: boolean = false
): string[] {
  if (!info.native) {
    return []
  }

  const constructorMethod = info.constructor

  if (constructorMethod === null || typeof constructorMethod === 'undefined') {
    return []
  }

  const initializerPlan = createNativeClassConstructorInitializerPlan(info, constructorMethod)
  const head = emitCClassConstructorHead(info, baseContext, initializerPlan.initializers, inClass)

  if (head === null || typeof head === 'undefined') {
    return []
  }

  return emitNativeClassConstructorDeclaration(info, constructorMethod, head, initializerPlan.body, baseContext, deps)
}

function createNativeClassConstructorInitializerPlan(
  info: CClassInfo,
  constructorMethod: CNode
): NativeClassConstructorInitializerPlan {
  const body: CNode[] = []
  const initializers = new Map<string, string>()
  const params: CFunctionParam[] = constructorMethod.params
  let canMoveInitializer = true

  for (const statement of declarationNodeArray(constructorMethod.body)) {
    if (canMoveInitializer) {
      const initializer = nativeClassConstructorInitializerForStatement(info, params, statement)

      if (initializer !== null && typeof initializer !== 'undefined' && !initializers.has(initializer.field)) {
        initializers.set(initializer.field, initializer.expression)
        continue
      }
    }

    canMoveInitializer = false
    body.push(statement)
  }

  return {
    body,
    initializers
  }
}

function nativeClassConstructorInitializerForStatement(
  info: CClassInfo,
  params: CFunctionParam[],
  statement: CNode
): NativeClassConstructorInitializer | null {
  if (statement.type !== 'ExpressionStatement' || statement.expression.type !== 'AssignmentExpression') {
    return null
  }

  const fieldName = nativeClassThisFieldName(statement.expression.target)

  if (fieldName === null || typeof fieldName === 'undefined') {
    return null
  }

  const paramName = nativeClassReferenceName(statement.expression.value)

  if (paramName === null || typeof paramName === 'undefined') {
    return null
  }

  const field = nativeClassFieldForName(info, fieldName)
  const param = nativeClassParamForName(params, paramName)

  if (
    field === null ||
    typeof field === 'undefined' ||
    param === null ||
    typeof param === 'undefined' ||
    !nativeClassConstructorParamCanInitializeField(field, param)
  ) {
    return null
  }

  return {
    field: field.name,
    expression: emitCIdentifier(param.name)
  }
}

function nativeClassConstructorParamCanInitializeField(field: CObjectShapeField, param: CFunctionParam): boolean {
  if (classFieldUsesCppStringStorage(field) && classParamUsesCppStringStorage(param)) {
    return true
  }

  const fieldCppType = classFieldOptionalLibraryNativeCppType(field)
  const paramCppType = classParamOptionalLibraryNativeCppType(param)

  return fieldCppType !== null && fieldCppType === paramCppType
}

function nativeClassFieldForName(info: CClassInfo, name: string): CObjectShapeField | null {
  for (const field of info.fields) {
    if (field.name === name) {
      return field
    }
  }

  return null
}

function nativeClassParamForName(params: CFunctionParam[], name: string): CFunctionParam | null {
  for (const param of params) {
    if (param.name === name) {
      return param
    }
  }

  return null
}

function nativeClassThisFieldName(expression: CNode): string | null {
  if (expression.type !== 'MemberExpression' || typeof expression.property !== 'string') {
    return null
  }

  if (!nativeClassIsThisExpression(expression.object)) {
    return null
  }

  return expression.property
}

function nativeClassIsThisExpression(expression: CNode | null | undefined): boolean {
  if (expression === null || typeof expression === 'undefined') {
    return false
  }

  if (expression.type === 'ThisExpression') {
    return true
  }

  return expression.type === 'Reference' && expression.path.length === 1 && expression.path[0] === 'this'
}

function nativeClassReferenceName(expression: CNode): string | null {
  if (expression.type !== 'Reference' || expression.path.length !== 1) {
    return null
  }

  return expression.path[0]
}

function emitNativeClassConstructorDeclaration(
  info: CClassInfo,
  constructorMethod: CNode,
  head: string,
  body: CNode[],
  baseContext: CEmitContext,
  deps: CDeclarationEmissionDependencies
): string[] {
  const context: CDeclarationFunctionContext = createFunctionContext(baseContext, 'void', false)
  const params: CFunctionParam[] = constructorMethod.params

  context.returnShape = null
  context.externalEventLoop = false
  context.variables.set('this', cClassValueTypeName(info.name))
  context.classInstanceTypes.set('this', info.name)
  registerFunctionParamsInContext(constructorMethod, params, context)
  registerNativeClassConstructorCppValueParams(params, context)

  const bodyLines: string[] = []
  const lines: string[] = []

  pushIndentedDeclarationLines(
    bodyLines,
    emitConstructorRuntimeParamPreludeForParams(constructorMethod, params, context, deps)
  )
  pushIndentedDeclarationLines(bodyLines, deps.emitStatementList(body, context))
  pushIndentedDeclarationLines(bodyLines, emitEventLoopDrain(context))
  const needsCleanup = shouldEmitCleanupLabel(context)

  lines.push(`${head} {`)
  pushIndentedDeclarationLines(lines, emitReturnValueDeclarations(context))
  pushIndentedDeclarationLines(lines, emitLoopFlowDeclarations(context))
  pushIndentedDeclarationLines(lines, emitReturnFlowDeclarations(context))
  pushIndentedDeclarationLines(lines, emitEventLoopDeclarations(context))
  pushIndentedDeclarationLines(lines, emitOwnedValueDeclarations(context))
  pushIndentedDeclarationLines(lines, emitOwnedAsyncResultDeclarations(context))
  pushIndentedDeclarationLines(lines, emitErrorChannelDeclarations(context))
  pushIndentedDeclarationLines(lines, emitBoxedValueDeclarations(context))
  pushIndentedDeclarationLines(lines, emitEventLoopInit(context))

  if (needsCleanup) {
    pushScopedDeclarationBody(lines, bodyLines)
    lines.push('cleanup:')
    pushIndentedDeclarationLines(lines, emitOwnedValueCleanup(context))
    pushIndentedDeclarationLines(lines, emitOwnedAsyncResultCleanup(context))
    pushIndentedDeclarationLines(lines, emitEventLoopCleanup(context))
    pushIndentedDeclarationLines(lines, emitBoxedValueCleanup(context))
    pushIndentedDeclarationLines(lines, emitCleanupReturn(context))
  } else {
    pushDeclarationLines(lines, replaceCleanupGotosWithReturn(bodyLines, 'return;'))
  }

  lines.push('}')

  return lines
}

function emitConstructorRuntimeParamPreludeForParams(
  statement: CNode,
  params: CFunctionParam[],
  context: CDeclarationFunctionContext,
  deps: CDeclarationEmissionDependencies
): string[] {
  const lines: string[] = []

  for (let index = 0; index < params.length; index = index + 1) {
    pushDeclarationLines(
      lines,
      emitConstructorRuntimeParamPreludeForParam(statement, params[index], index, context, deps)
    )
  }

  return lines
}

function emitConstructorRuntimeParamPreludeForParam(
  statement: CNode,
  param: CFunctionParam,
  index: number,
  context: CDeclarationFunctionContext,
  deps: CDeclarationEmissionDependencies
): string[] {
  if (
    classParamUsesCppValueStorage(param) ||
    classParamUsesCppStringStorage(param) ||
    classParamOptionalLibraryNativeCppType(param) !== null
  ) {
    return []
  }

  return emitRuntimeParamPreludeForParam(statement, param, index, context, deps)
}

function registerNativeClassConstructorCppValueParams(
  params: CFunctionParam[],
  context: CDeclarationFunctionContext
): void {
  for (const param of params) {
    if (!classParamUsesCppValueStorage(param) && !classParamUsesCppStringStorage(param)) {
      continue
    }

    if (param.valueType === 'string' && param.nullable !== true) {
      context.cppStringValues.add(param.name)
      context.runtimeStrings.add(param.name)
      context.runtimeStringValues.set(param.name, emitCIdentifier(param.name) + '.raw()')
    }
  }
}

export function emitClassMethodPrototype(info: CClassInfo, method: CNode, context: CEmitContext): string {
  if (!info.native) {
    return `${emitRuntimeClassMethodHead(info, method, context)};`
  }

  const params = emitClassMethodParams(info, method, context)

  return `${emitCReturnType(method.returnType, method.returnNullable, physicalReturnShape(method, method.returnShape, context))} ${emitCIdentifier(method.name)}(${joinDeclarationParams(
    params
  )});`
}

export function emitClassMethodHead(
  info: CClassInfo,
  method: CNode,
  context: CEmitContext,
  inClass: boolean = false
): string {
  if (!info.native) {
    return emitRuntimeClassMethodHead(info, method, context)
  }

  const params = emitClassMethodParams(info, method, context)
  const name = inClass
    ? emitCIdentifier(method.name)
    : `${emitCClassInfoTypeName(info)}::${emitCIdentifier(method.name)}`

  return `${emitCReturnType(method.returnType, method.returnNullable, physicalReturnShape(method, method.returnShape, context))} ${name}(${joinDeclarationParams(params)})`
}

function emitRuntimeClassMethodHead(info: CClassInfo, method: CNode, context: CEmitContext): string {
  const params = emitRuntimeClassMethodParams(info, method, context)
  const name = emitCClassInfoMethodName(info, method.name)

  return `static ${emitCReturnType(method.returnType, method.returnNullable, physicalReturnShape(method, method.returnShape, context))} ${name}(${joinDeclarationParams(params)})`
}

function emitRuntimeClassMethodParams(info: CClassInfo, method: CNode, context: CEmitContext): string[] {
  const params: string[] = []
  const methodEffectName = irClassMethodEffectName(info.name, method.name)

  if (functionTakesEventLoopParam(methodEffectName, context) && context.explicitEventLoop === true) {
    params.push('inox_loop* inox_loop')
  }

  params.push(`inox_value ${emitCLocalName('this')}`)

  for (let index = 0; index < method.params.length; index = index + 1) {
    params.push(emitClassMethodParam(method.params[index], index, method, context))
  }

  return params
}

function emitClassMethodParams(info: CClassInfo, method: CNode, context: CEmitContext): string[] {
  const params: string[] = []
  const methodEffectName = irClassMethodEffectName(info.name, method.name)

  if (functionTakesEventLoopParam(methodEffectName, context) && context.explicitEventLoop === true) {
    params.push('inox_loop* inox_loop')
  }

  for (let index = 0; index < method.params.length; index = index + 1) {
    params.push(emitClassMethodParam(method.params[index], index, method, context))
  }

  return params
}

function emitClassMethodParam(param: CFunctionParam, index: number, method: CNode, context: CEmitContext): string {
  const nativeClassDeclaration = emitNativeClassParamDeclaration(param, context)

  if (nativeClassDeclaration !== null) {
    return nativeClassDeclaration
  }

  const libraryCppType = libraryNativeParamCppType(param, context)

  if (libraryCppType !== null) {
    return `${libraryCppType} ${emitCLocalName(param.name)}`
  }

  if (isBoxedScalarParam(param)) {
    return `inox_value ${emitCScalarParamName(param.name)}`
  }

  if (param.valueType === 'string') {
    return `inox_value ${emitCStringParamName(param.name)}`
  }

  if (param.valueType === 'object') {
    if (isBoxedFunctionParam(param, index, method, context)) {
      return `inox_value ${emitCObjectParamName(param.name)}`
    }

    return `inox_value ${emitCLocalName(param.name)}`
  }

  if (param.valueType === 'function') {
    if (resolveFunctionParameterRuntimeType(method.name, index, param, context)) {
      return `inox_value ${emitCLocalName(param.name)}`
    }

    return emitFunctionParameter(param.name, param.functionType, context, param.loc)
  }

  if (isBoxedFunctionParam(param, index, method, context) && isBoxedScalarParamValueType(param.valueType)) {
    return `${emitCType(param.valueType)} ${emitCScalarParamName(param.name)}`
  }

  return `${emitCType(param.valueType)} ${emitCLocalName(param.name)}`
}

function physicalReturnShape(
  declaration: CNode,
  fallback: CObjectShape | null | undefined,
  context: CEmitContext
): CObjectShape | null {
  if (!cBooleanValueIsTrue(declaration.async)) {
    const nativeShape = cTypeRefNativeShape(declaration.returnTypeRef, context.libraries)

    if (nativeShape !== null) {
      return nativeShape
    }
  }

  const declaredReturnType = declaration.declaredReturnType

  if (
    declaredReturnType !== null &&
    typeof declaredReturnType !== 'undefined' &&
    context.classInfos.has(declaredReturnType)
  ) {
    return null
  }

  return fallback ?? null
}

function hasPhysicalNativeReturn(declaration: CNode, context: CEmitContext): boolean {
  return (
    !cBooleanValueIsTrue(declaration.async) &&
    cTypeRefNativeShape(declaration.returnTypeRef, context.libraries) !== null
  )
}

function resolveCFunctionReturnInfo(statement: CNode, context: CEmitContext): CFunctionReturnInfo {
  const returnType = resolveFunctionReturnType(statement.name, statement.returnType, context)
  const returnNullable = resolveFunctionReturnNullable(statement.name, statement.returnNullable, context)
  const declaredAsyncResultValueType: string | null | undefined = statement.returnAsyncResultValueType

  if (cBooleanValueIsTrue(context.functionAsyncFlags.get(statement.name)) && returnType === 'async-result') {
    let asyncResultValueType = context.functionReturnAsyncResultValueTypes.get(statement.name)

    if (asyncResultValueType === null || typeof asyncResultValueType === 'undefined') {
      asyncResultValueType = declaredAsyncResultValueType
    }

    if (asyncResultValueType === null || typeof asyncResultValueType === 'undefined') {
      asyncResultValueType = 'void'
    }

    return {
      returnType: asyncResultValueType,
      returnNullable: false
    }
  }

  return {
    returnType,
    returnNullable
  }
}

export function emitFunctionParameter(
  name: string,
  functionType: CFunctionType | null | undefined,
  context: CEmitContext,
  loc: CSourceLocation,
  seenTypes: string[] = []
): string {
  reportUnsupportedCFunctionType(functionType, context, loc, seenTypes)

  if (!isPlainFunctionPointerType(functionType, seenTypes) && isRuntimeFunctionType(functionType)) {
    return `inox_value ${emitCLocalName(name)}`
  }

  return emitFunctionPointerParameter(name, functionType, seenTypes)
}

export function emitFunctionPointerParameter(
  name: string,
  functionType: CFunctionType | null | undefined,
  seenTypes: string[] = []
): string {
  return `${emitFunctionPointerReturnType(functionType)} (*${emitCLocalName(name)})(${emitFunctionPointerParams(functionType, [], seenTypes)})`
}

export function reportUnsupportedCFunctionType(
  functionType: CFunctionType | null | undefined,
  context: CEmitContext,
  loc: CSourceLocation,
  seenTypes: string[] = []
): void {
  if (functionType === null || typeof functionType === 'undefined') {
    return
  }

  if (isPlainFunctionPointerType(functionType, seenTypes) || isRuntimeFunctionType(functionType)) {
    return
  }

  context.diagnostics.push(
    diagnostic(
      'INOX_C_FUNCTION_VALUE',
      'typed C callbacks currently support only void callbacks with number/boolean/string/object parameters',
      loc
    )
  )
}

export function emitMainWrapper(
  irPrograms: IrProgram[],
  baseContext: CEmitContext,
  deps: CDeclarationEmissionDependencies
): string[] {
  const context = createFunctionContext(baseContext, 'void', false)
  const body = collectIrTopLevelNodesFromPrograms(irPrograms, 'statement')
  const bodyLines: string[] = []
  const lines: string[] = []

  context.moduleValueDeclarationScope = true
  context.cleanupEnabled = false
  context.externalEventLoop = true

  pushIndentedDeclarationLines(bodyLines, deps.emitStatementList(body, context))

  lines.push('static void inox_main() {')
  pushIndentedDeclarationLines(lines, emitLoopFlowDeclarations(context))
  pushIndentedDeclarationLines(lines, emitMainReturnValueDeclarations(context))
  pushIndentedDeclarationLines(lines, emitReturnFlowDeclarations(context))
  pushIndentedDeclarationLines(lines, emitOwnedValueDeclarations(context))
  pushIndentedDeclarationLines(lines, emitOwnedAsyncResultDeclarations(context))
  pushIndentedDeclarationLines(lines, emitErrorChannelDeclarations(context))
  pushIndentedDeclarationLines(lines, emitBoxedValueDeclarations(context))
  pushDeclarationLines(lines, bodyLines)
  lines.push('}')
  lines.push('')

  if (context.runtimeEntrypointAdapter !== null) {
    lines.push('int main(int argc, char** argv) {')
    if (context.runtimeEntrypointAdapter.acceptsEntryPath && baseContext.runtimeEntryPath !== null) {
      lines.push(
        `  return ${context.runtimeEntrypointAdapter.cFunction}(argc, argv, ${cStringLiteral(baseContext.runtimeEntryPath)}, inox_main);`
      )
    } else {
      lines.push(`  return ${context.runtimeEntrypointAdapter.cFunction}(argc, argv, inox_main);`)
    }
  } else {
    lines.push('int main() {')
    lines.push('  return inox::main(inox_main);')
  }

  lines.push('}')

  return lines
}

function emitRuntimeParamPreludeForParams(
  statement: CNode,
  params: CFunctionParam[],
  context: CFunctionContext,
  deps: CDeclarationEmissionDependencies
): string[] {
  const lines: string[] = []

  for (let index = 0; index < params.length; index = index + 1) {
    pushDeclarationLines(lines, emitRuntimeParamPreludeForParam(statement, params[index], index, context, deps))
  }

  return lines
}

function emitRuntimeParamPreludeForParam(
  statement: CNode,
  param: CFunctionParam,
  index: number,
  context: CFunctionContext,
  deps: CDeclarationEmissionDependencies
): string[] {
  const lines: string[] = []
  const localName = emitCLocalName(param.name)

  if (param.coroutineStorageKind === 'boxed-number' || param.coroutineStorageKind === 'boxed-value') {
    lines.push(emitRuntimeTypeCheck(`!${localName}.valid()`, context))
    return lines
  }

  if (param.coroutineStorageKind === 'runtime-value') {
    const storageName = emitCoroutineStorageParamName(param)

    if (param.valueType === 'string') {
      lines.push(emitRuntimeTypeCheck(`${storageName}.tag != INOX_TAG_STRING || ${storageName}.as.ref == 0`, context))
      lines.push(`inox_string* ${localName} = (inox_string*)${storageName}.as.ref;`)
    } else {
      lines.push(`inox_value ${localName} = ${storageName}.raw();`)
    }

    return lines
  }

  if (libraryNativeParamCppType(param, context) !== null || isNativeClassParam(param, context)) {
    return lines
  }

  pushDeclarationLines(lines, emitDefaultRuntimeParamPreludeForParam(param, context, deps))

  const nativeValidExpression = compilerLibraryNativeRuntimeValueValidExpressionForTypeRef(
    context.libraries,
    param.typeRef
  )

  if (nativeValidExpression !== null) {
    const runtimeValueName = emitRuntimeParamValueName(statement, param, index, context)
    const valid = nativeValidExpression.split('$value').join(runtimeValueName)
    const mismatch =
      param.nullable === true || param.optional === true
        ? `${runtimeValueName}.tag != INOX_TAG_NULL && ${runtimeValueName}.tag != INOX_TAG_UNDEFINED && !(${valid})`
        : `!(${valid})`

    lines.push(emitRuntimeTypeCheck(mismatch, context))
    return lines
  }

  const alternativeRuntimeValueName = emitRuntimeParamValueName(statement, param, index, context)
  const alternativeValidExpressions = runtimeTypeAlternativeValidExpressions(
    param.runtimeTypeAlternatives,
    alternativeRuntimeValueName,
    context.libraries
  )

  if (alternativeValidExpressions !== null) {
    if (alternativeValidExpressions.length > 0) {
      const valid = alternativeValidExpressions.join(' || ')
      const nullable =
        param.nullable === true ||
        param.optional === true ||
        runtimeTypeAlternativesAreNullable(param.runtimeTypeAlternatives)
      const mismatch = nullable
        ? `${alternativeRuntimeValueName}.tag != INOX_TAG_NULL && ${alternativeRuntimeValueName}.tag != INOX_TAG_UNDEFINED && !(${valid})`
        : `!(${valid})`

      lines.push(emitRuntimeTypeCheck(mismatch, context))
    }

    return lines
  }

  if (isNullableScalarParam(param)) {
    const paramName = emitCScalarParamName(param.name)
    const expectedTag = cRuntimeValueTag(param.valueType)

    pushDeclarationLines(lines, emitRuntimeNullableValueCheck(paramName, expectedTag, context))
    lines.push(`inox_value ${localName} = ${paramName};`)
    return lines
  }

  if (isBoxedScalarParam(param) && (param.valueType === 'number' || param.valueType === 'boolean')) {
    const paramName = emitCScalarParamName(param.name)
    const expectedTag = cRuntimeValueTag(param.valueType)

    lines.push(emitRuntimeTypeCheck(`${paramName}.tag != ${expectedTag}`, context))

    if (param.valueType === 'boolean') {
      lines.push(`double ${localName} = ${paramName}.as.boolean ? 1 : 0;`)
    } else {
      lines.push(`double ${localName} = ${paramName}.as.number;`)
    }

    return lines
  }

  if (isBoxedFunctionParam(param, index, statement, context) && isBoxedRuntimeValueParamType(param.valueType)) {
    let paramName = emitCObjectParamName(param.name)
    let tag = 'INOX_TAG_OBJECT'

    if (param.valueType === 'string') {
      paramName = emitCStringParamName(param.name)
      tag = 'INOX_TAG_STRING'
    }

    lines.push(emitRuntimeTypeCheck(`${paramName}.tag != ${tag} || ${paramName}.as.ref == 0`, context))
    lines.push(
      emitStatusCheck(`inox_shared_value_box_new(&inox_default_allocator, ${paramName}, &${localName})`, context)
    )
    return lines
  }

  if (param.valueType === 'string') {
    const paramName = emitCStringParamName(param.name)

    if (param.nullable === true) {
      pushDeclarationLines(lines, emitRuntimeNullableValueCheck(paramName, 'INOX_TAG_STRING', context))
      lines.push(`inox_value ${localName} = ${paramName};`)
      return lines
    }

    lines.push(emitRuntimeTypeCheck(`${paramName}.tag != INOX_TAG_STRING || ${paramName}.as.ref == 0`, context))
    lines.push(`inox_string* ${localName} = (inox_string*)${paramName}.as.ref;`)
    return lines
  }

  if (param.valueType === 'object') {
    if (libraryNativeCppType(physicalParamShape(param, context)) !== null) {
      return lines
    }

    if (param.nullable === true || param.optional === true) {
      pushDeclarationLines(lines, emitRuntimeNullableValueCheck(localName, 'INOX_TAG_OBJECT', context))
      return lines
    }

    lines.push(emitRuntimeValueCheck(localName, 'INOX_TAG_OBJECT', context))
    return lines
  }

  if (param.valueType === 'function' && resolveFunctionParameterRuntimeType(statement.name, index, param, context)) {
    if (param.nullable === true || param.optional === true) {
      pushDeclarationLines(lines, emitRuntimeNullableValueCheck(localName, 'INOX_TAG_FUNCTION', context))
      return lines
    }

    lines.push(emitRuntimeTypeCheck(`${localName}.tag != INOX_TAG_FUNCTION || ${localName}.as.ref == 0`, context))
    return lines
  }

  if (isBoxedFunctionParam(param, index, statement, context) && isBoxedScalarParamValueType(param.valueType)) {
    lines.push(
      emitStatusCheck(
        `inox_shared_number_box_new(&inox_default_allocator, ${emitCScalarParamName(param.name)}, &${localName})`,
        context
      )
    )
  }

  return lines
}

function emitCoroutineStorageParamName(param: CFunctionParam): string {
  return `inox_coroutine_${emitCLocalName(param.name)}`
}

function emitRuntimeParamValueName(
  statement: CNode,
  param: CFunctionParam,
  index: number,
  context: CFunctionContext
): string {
  if (isBoxedScalarParam(param)) {
    return emitCScalarParamName(param.name)
  }

  if (param.valueType === 'string') {
    return emitCStringParamName(param.name)
  }

  if (param.valueType === 'object' && isBoxedFunctionParam(param, index, statement, context)) {
    return emitCObjectParamName(param.name)
  }

  return emitCLocalName(param.name)
}

function libraryNativeParamCppType(param: CFunctionParam, context: CEmitContext): string | null {
  const cppType = libraryNativeBoundaryCppType(
    param.valueType,
    param.nullable === true,
    param.optional === true,
    physicalParamShape(param, context)
  )

  if (cppType !== null || param.valueType !== 'async-result') {
    return cppType
  }

  return requireCompilerLibraryAsyncResultCppType(context.libraries, param.typeRef)
}

function physicalParamShape(param: CFunctionParam, context: CEmitContext): CObjectShape | null {
  return cTypeRefNativeShape(param.typeRef, context.libraries) ?? param.shape ?? null
}

function isNativeClassParam(param: CFunctionParam, context: CFunctionContext): boolean {
  return nativeClassParamName(param, context) !== null
}

function nativeClassParamName(param: CFunctionParam, context: CEmitContext): string | null {
  const className = param.className

  if (className === null || typeof className === 'undefined' || param.nullable === true || param.ownership === 'weak') {
    return null
  }

  const info = context.classInfos.get(className)

  if (info === null || typeof info === 'undefined' || !info.native) {
    return null
  }

  return className
}

function emitNativeClassParamDeclaration(param: CFunctionParam, context: CEmitContext): string | null {
  const className = nativeClassParamName(param, context)

  if (className === null) {
    return null
  }

  return `const ${emitCClassTypeNameForClassName(context, className)}& ${emitCLocalName(param.name)}`
}

function emitDefaultRuntimeParamPreludeForParam(
  param: CFunctionParam,
  context: CFunctionContext,
  deps: CDeclarationEmissionDependencies
): string[] {
  const value = param.defaultValue
  const localName = emitCLocalName(param.name)

  if (param.valueType === 'number' && value !== null && typeof value !== 'undefined' && param.optional === true) {
    const paramName = emitCScalarParamName(param.name)
    const prepared = deps.emitPreparedNumberExpression(value, context)
    const lines = [`if (${paramName}.tag == INOX_TAG_UNDEFINED) {`]

    for (const line of prepared.lines) {
      lines.push(`  ${line}`)
    }

    lines.push(`  ${paramName} = inox_number_value(static_cast<double>(${prepared.expression}));`)
    lines.push('}')

    return lines
  }

  if (
    param.valueType === 'boolean' &&
    value !== null &&
    typeof value !== 'undefined' &&
    value.type === 'BooleanLiteral'
  ) {
    const paramName = emitCScalarParamName(param.name)
    const defaultValue = value.value === true ? 'true' : 'false'

    return [`if (${paramName}.tag == INOX_TAG_UNDEFINED) {`, `  ${paramName} = inox_bool_value(${defaultValue});`, '}']
  }

  if (
    param.valueType === 'string' &&
    value !== null &&
    typeof value !== 'undefined' &&
    value.type === 'StringLiteral'
  ) {
    const paramName = emitCStringParamName(param.name)
    const temp = nextCName(context, `${param.name}_default`)

    return [
      `if (${paramName}.tag == INOX_TAG_UNDEFINED) {`,
      `  auto ${temp} = inox::String(${cStringLiteral(value.value)}, ${utf8ByteLength(value.value)});`,
      `  if (!${temp}.valid()) ${emitFailureStatement(context)}`,
      `  ${paramName} = ${temp};`,
      `  inox_retain(${paramName});`,
      '}'
    ]
  }

  if (
    param.valueType === 'object' &&
    value !== null &&
    typeof value !== 'undefined' &&
    value.type === 'ObjectLiteral' &&
    value.properties.length === 0
  ) {
    const temp = nextCName(context, `${param.name}_default`)
    const shapeName = nextCName(context, `${param.name}_default_shape`)
    const fieldsName = `${shapeName}_fields`
    const lines: string[] = [
      `static const inox_field_info ${fieldsName}[] = {`,
      '};',
      `static const inox_shape ${shapeName} = { 0, ${fieldsName} };`,
      `if (${localName}.tag == INOX_TAG_UNDEFINED) {`
    ]

    registerOwnedValue(context, temp)
    lines.push(
      `  if (inox_object_new(&inox_default_allocator, &${shapeName}, &${temp}) != INOX_OK) ${emitFailureStatement(context)}`
    )
    lines.push(`  ${localName} = ${temp};`)
    lines.push('}')

    return lines
  }

  if (value !== null && typeof value !== 'undefined' && value.type === 'ArrayLiteral' && value.elements.length === 0) {
    const temp = nextCName(context, `${param.name}_default`)
    const created = nextCName(context, `${param.name}_default_sequence`)
    const materialization = compilerLibraryIntrinsicSequenceMaterialization(context.libraries, 'array-literal')
    const runtimeValueExpression = compilerLibraryNativeRuntimeValueExpressionForTypeRef(
      context.libraries,
      param.typeRef
    )

    if (materialization === null || runtimeValueExpression === null) {
      return []
    }

    registerOwnedValue(context, temp)

    return [
      `if (${localName}.tag == INOX_TAG_UNDEFINED) {`,
      `  auto ${created} = ${materialization.createExpression};`,
      `  if (inox::thrown()) ${emitFailureStatement(context)}`,
      `  ${temp} = ${runtimeValueExpression.split('$value').join(created)};`,
      `  inox_retain(${temp});`,
      `  ${localName} = ${temp};`,
      '}'
    ]
  }

  return []
}
