import { diagnostic } from '../diagnostics.ts'
import { compilerLibraryIntrinsicNativeCppType } from './value-types.ts'
import { collectIrTopLevelNodesFromPrograms, irClassMethodEffectName } from '../ir.ts'
import type { AnyNode as CNode, IrProgram, SourceLocation } from '../types.ts'
import {
  emitFunctionPointerParams,
  emitFunctionPointerReturnType,
  isPlainObjectFunctionField,
  isPlainFunctionPointerType,
  isRuntimeFunctionType,
  normalizeFunctionType,
  resolveFunctionParameterRuntimeType
} from './async/callbacks.ts'
import { functionTakesEventLoopParam } from './async/promises.ts'
import type { AsyncTaskLoweringDependencies } from './async/tasks.ts'
import { emitAsyncTaskFunctionStubDeclaration } from './async/tasks.ts'
import type { CEmitContextWithDependencies, CFunctionContextWithDependencies } from './context.ts'
import {
  createFunctionContext,
  emitBoxedValueCleanup,
  emitBoxedValueDeclarations,
  emitCleanupReturn,
  emitErrorChannelDeclarations,
  emitEventLoopCleanup,
  emitEventLoopDeclarations,
  emitEventLoopDrain,
  emitEventLoopInit,
  emitFailureStatement,
  emitLoopFlowDeclarations,
  emitMainReturnValueDeclarations,
  emitOwnedPromiseCleanup,
  emitOwnedPromiseDeclarations,
  emitOwnedValueCleanup,
  emitOwnedValueDeclarations,
  emitReturnFlowDeclarations,
  emitReturnValueDeclarations,
  emitRuntimeTypeCheck,
  emitStatusResultDeclarations,
  emitThrowingFunctionErrorTransfer,
  nextCName,
  registerBoxedValue,
  registerOwnedValue,
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
import type {
  CClassInfo,
  CFunctionParam,
  CFunctionType,
  CObjectShape,
  CObjectShapeField,
  CPreparedExpression as PreparedExpression
} from './types.ts'
import {
  cIterableElementValueType,
  cRuntimeValueTag,
  cTypeRefNativeShape,
  emitCObjectParamName,
  emitCReturnType,
  emitCScalarParamName,
  emitCStringParamName,
  emitCType,
  emitThrowingFunctionOutType,
  isBoxedScalarParam,
  isNullableScalarParam,
  isOpaqueRuntimeValueType,
  isRuntimeNullableType,
  isThrowingFunctionRuntimeOut,
  libraryNativeBoundaryCppType,
  libraryNativeCppType,
  requireCompilerLibraryAsyncResultCppType
} from './value-types.ts'
import type { ArrayLoweringDependencies } from './values/arrays.ts'
import type { ClassLoweringDependencies } from './values/classes.ts'
import {
  classFieldUsesCppStringStorage,
  classParamUsesCppStringStorage,
  classParamUsesCppValueStorage,
  cClassValueTypeName,
  emitCClassConstructorHead,
  emitCClassInfoMethodName,
  emitCClassInfoTypeName,
  registerClassObjectShape
} from './values/classes.ts'
import { isThrowingFunctionName } from './values/expressions.ts'
import type { NullableLoweringDependencies } from './values/nullable.ts'
import { registerObjectShape } from './values/objects.ts'
import type { StatementLoweringDependencies } from './values/statements.ts'
import { registerErrorChannel } from './values/statements.ts'
import type { StringLoweringDependencies } from './values/strings.ts'

type CEmitContext = CEmitContextWithDependencies<
  ArrayLoweringDependencies,
  AsyncTaskLoweringDependencies,
  ClassLoweringDependencies,
  NullableLoweringDependencies,
  StatementLoweringDependencies,
  StringLoweringDependencies
>
type CFunctionContext = CFunctionContextWithDependencies<
  ArrayLoweringDependencies,
  AsyncTaskLoweringDependencies,
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
  asyncTaskLoweringDependencies: AsyncTaskLoweringDependencies
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
  if (params.length === 0) {
    return 'void'
  }

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
  context.returnShape = physicalReturnShape(statement, context.functionReturnShapes.get(statement.name), context)
  context.returnLibraryNative = hasPhysicalNativeReturn(statement, context)

  context.throwingFunction = isThrowingFunctionName(statement.name, context)
  context.externalEventLoop = functionTakesEventLoopParam(statement.name, context)
  if (returnType === 'void' && !context.throwingFunction && context.externalEventLoop) {
    context.cleanupEnabled = false
  }
  context.functionReturnOut = 'inox_out'
  context.functionErrorOut = 'inox_error_out'

  if (baseContext.asyncTaskWrappers.has(statement.name)) {
    return emitAsyncTaskFunctionStubDeclaration(statement, context, deps.asyncTaskLoweringDependencies)
  }

  if (context.throwingFunction) {
    registerErrorChannel(context)
  }

  registerFunctionParamsInContext(statement, params, context)

  const bodyLines: string[] = []
  const lines: string[] = []

  pushIndentedDeclarationLines(bodyLines, emitRuntimeParamPreludeForParams(statement, params, context, deps))
  pushIndentedDeclarationLines(bodyLines, deps.emitStatementList(statement.body, context))
  pushIndentedDeclarationLines(bodyLines, emitEventLoopDrain(context))
  const needsCleanup = shouldEmitCleanupLabel(context)

  lines.push(`${emitFunctionHead(statement, context)} {`)
  pushIndentedDeclarationLines(lines, emitThrowingFunctionPrelude(context))
  pushIndentedDeclarationLines(lines, emitReturnValueDeclarations(context))
  pushIndentedDeclarationLines(lines, emitStatusResultDeclarations(context))
  pushIndentedDeclarationLines(lines, emitLoopFlowDeclarations(context))
  pushIndentedDeclarationLines(lines, emitReturnFlowDeclarations(context))
  pushIndentedDeclarationLines(lines, emitEventLoopDeclarations(context))
  pushIndentedDeclarationLines(lines, emitOwnedValueDeclarations(context))
  pushIndentedDeclarationLines(lines, emitOwnedPromiseDeclarations(context))
  pushIndentedDeclarationLines(lines, emitErrorChannelDeclarations(context))
  pushIndentedDeclarationLines(lines, emitBoxedValueDeclarations(context))
  pushIndentedDeclarationLines(lines, emitEventLoopInit(context))

  if (needsCleanup) {
    pushScopedDeclarationBody(lines, bodyLines)
    lines.push('cleanup:')
    pushIndentedDeclarationLines(lines, emitThrowingFunctionErrorTransfer(context))
    pushIndentedDeclarationLines(lines, emitOwnedValueCleanup(context))
    pushIndentedDeclarationLines(lines, emitOwnedPromiseCleanup(context))
    pushIndentedDeclarationLines(lines, emitEventLoopCleanup(context))
    pushIndentedDeclarationLines(lines, emitBoxedValueCleanup(context))
    pushIndentedDeclarationLines(lines, emitCleanupReturn(context))
  } else if (context.returnType !== 'void') {
    let returnValue = '0'
    const libraryCppType = libraryNativeBoundaryCppType(
      context.returnType,
      context.returnNullable === true,
      false,
      context.returnShape
    )

    if (libraryCppType !== null) {
      returnValue = `${libraryCppType}{}`
    } else if (isThrowingFunctionRuntimeOut(context)) {
      returnValue = 'inox_undefined_value()'
    }

    pushDeclarationLines(lines, bodyLines)
    lines.push(`  return ${returnValue};`)
  } else {
    pushDeclarationLines(lines, bodyLines)
  }

  lines.push('}')

  return lines
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
    context.runtimeValueStorageNames.delete(param.name)

    if (isNullableScalarParam(param)) {
      context.nullableVariables.add(param.name)
    }

    const libraryCppType = libraryNativeParamCppType(param, context)
    const nativeClassParam = nativeClassParamName(param, context)

    if (libraryCppType !== null && param.valueType === 'promise') {
      context.variables.set(param.name, 'promise')
      context.promiseValueTypes.set(param.name, declarationTypeOrUnknown(param.promiseValueType))
    } else if (libraryCppType !== null) {
      context.variables.set(param.name, 'object')
      context.cppValueTypes.set(param.name, libraryCppType)
      registerObjectShape(context, param.name, param.shape)
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
        registerObjectShape(context, param.name, param.shape)

        if (param.declaredType !== null && typeof param.declaredType !== 'undefined') {
          context.objectDeclaredTypes.set(param.name, param.declaredType)
        }
      }
    } else if (param.valueType === 'string') {
      context.variables.set(param.name, 'string')

      if (param.nullable !== true && !isNullableScalarParam(param)) {
        context.runtimeStrings.add(param.name)
        context.runtimeStringValues.set(param.name, emitCStringParamName(param.name))
      }
    } else if (param.valueType === 'object') {
      context.variables.set(param.name, 'object')
      registerObjectShape(context, param.name, param.shape)

      if (param.declaredType !== null && typeof param.declaredType !== 'undefined') {
        context.objectDeclaredTypes.set(param.name, param.declaredType)
      }
    } else if (param.valueType === 'array') {
      context.variables.set(param.name, 'array')
      context.runtimeArrayElementTypes.set(
        param.name,
        cIterableElementValueType(param.typeRef, context.libraries) ?? 'unknown'
      )
    } else if (param.valueType === 'promise') {
      context.variables.set(param.name, 'promise')
      context.promiseValueTypes.set(param.name, declarationTypeOrUnknown(param.promiseValueType))
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

export function emitFunctionHead(statement: CNode, context: CEmitContext): string {
  const statementName: string = statement.name
  let name = context.functionNames.get(statementName)

  if (name === null || typeof name === 'undefined') {
    name = emitCFunctionName(statementName)
  }

  const returnInfo = resolveCFunctionReturnInfo(statement, context)
  const returnType = returnInfo.returnType
  const returnNullable = returnInfo.returnNullable
  const functionParams = resolveFunctionDeclarationParams(statement.name, statement.params, context)
  const returnShape = physicalReturnShape(statement, context.functionReturnShapes.get(statement.name), context)
  const params: string[] = []

  for (let index = 0; index < functionParams.length; index = index + 1) {
    pushFunctionHeadParam(params, functionParams[index], index, statement, context)
  }

  if (functionTakesEventLoopParam(statement.name, context) && context.explicitEventLoop === true) {
    params.unshift('inox_loop* inox_loop')
  }

  if (isThrowingFunctionName(statement.name, context)) {
    if (returnType !== 'void') {
      params.push(
        `${emitThrowingFunctionOutType(returnType, returnNullable, returnShape)}* inox_out`
      )
    }

    params.push('inox_value* inox_error_out')

    return `inox_status ${name}(${declarationParamList(params)})`
  }

  return `${emitCReturnType(returnType, returnNullable, returnShape)} ${name}(${declarationParamList(params)})`
}

function pushFunctionHeadParam(
  params: string[],
  param: CFunctionParam,
  index: number,
  statement: CNode,
  context: CEmitContext
): void {
  params.push(emitFunctionHeadParam(param, index, statement, context))
  pushObjectFunctionFieldParams(params, param, context)
}

function pushObjectFunctionFieldParams(params: string[], param: CFunctionParam, context: CEmitContext): void {
  if (param.valueType !== 'object') {
    return
  }

  const seenTypes: string[] = []
  pushSeenDeclaredType(seenTypes, param.declaredType)

  pushObjectShapeFunctionFieldParams(params, param.name, param.shape, context, param.loc, seenTypes)
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
    value === 'ArrayFunctionContext' ||
    value === 'CEmitContext' ||
    value === 'CFunctionContext' ||
    value === 'CDeclarationFunctionContext' ||
    value === 'CallbackEmitContext' ||
    value === 'CallbackFunctionContext' ||
    value === 'ClassFunctionContext' ||
    value === 'CollectionFunctionContext' ||
    value === 'NullableFunctionContext' ||
    value === 'PromiseEmitContext' ||
    value === 'PromiseFunctionContext' ||
    value === 'StringCContext' ||
    value === 'AsyncTaskEmitContext' ||
    value === 'AsyncTaskFunctionContext' ||
    value === 'AsyncTaskPlannerContext'
  )
}

function isDependencyCarrierDeclaredType(value: string): boolean {
  return (
    value === 'CModuleEmissionDependencies' ||
    value === 'CDeclarationEmissionDependencies' ||
    value === 'ArrayLoweringDependencies' ||
    value === 'AsyncTaskLoweringDependencies' ||
    value === 'CallbackLoweringDependencies' ||
    value === 'ClassLoweringDependencies' ||
    value === 'CollectionLoweringDependencies' ||
    value === 'NullableLoweringDependencies' ||
    value === 'PromiseChainLoweringDependencies' ||
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

  return emitFunctionParameter(
    name,
    field.functionType,
    context,
    loc,
    seenTypes
  )
}

function emitFunctionHeadParam(param: CFunctionParam, index: number, statement: CNode, context: CEmitContext): string {
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

  if (param.valueType === 'array') {
    return `inox_value ${emitCLocalName(param.name)}`
  }

  if (param.valueType === 'function') {
    if (resolveFunctionParameterRuntimeType(statement.name, index, param, context)) {
      return `inox_value ${emitCLocalName(param.name)}`
    }

    return emitFunctionParameter(param.name, param.functionType, context, param.loc)
  }

  if (isBoxedFunctionParam(param, index, statement, context) && isBoxedScalarParamValueType(param.valueType)) {
    return `${emitCType(param.valueType)} ${emitCLocalName(param.name)}`
  }

  return `${emitCType(param.valueType)} ${emitCLocalName(param.name)}`
}

export function emitClassMethodDeclaration(
  info: CClassInfo,
  method: CNode,
  baseContext: CEmitContext,
  deps: CDeclarationEmissionDependencies
): string[] {
  const context: CDeclarationFunctionContext = createFunctionContext(
    baseContext,
    method.returnType,
    method.returnNullable
  )
  const params = method.params
  const methodEffectName = irClassMethodEffectName(info.name, method.name)

  context.returnShape = physicalReturnShape(method, method.returnShape, context)
  context.returnLibraryNative = hasPhysicalNativeReturn(method, context)
  context.throwingFunction = isThrowingClassMethod(info, method, baseContext)
  context.externalEventLoop = functionTakesEventLoopParam(methodEffectName, baseContext)
  context.functionReturnOut = 'inox_out'
  context.functionErrorOut = 'inox_error_out'

  if (info.native) {
    context.variables.set('this', cClassValueTypeName(info.name))
  } else {
    context.variables.set('this', 'object')
    registerClassObjectShape(context, 'this', info)
  }

  context.classInstanceTypes.set('this', info.name)
  if (context.throwingFunction) {
    registerErrorChannel(context)
  }
  registerFunctionParamsInContext(method, params, context)

  const bodyLines: string[] = []
  const lines: string[] = []

  pushIndentedDeclarationLines(bodyLines, emitRuntimeParamPreludeForParams(method, params, context, deps))
  pushIndentedDeclarationLines(bodyLines, deps.emitStatementList(method.body, context))
  pushIndentedDeclarationLines(bodyLines, emitEventLoopDrain(context))

  const needsCleanup = shouldEmitCleanupLabel(context)

  lines.push(`${emitClassMethodHead(info, method, context)} {`)
  pushIndentedDeclarationLines(lines, emitThrowingFunctionPrelude(context))
  pushIndentedDeclarationLines(lines, emitReturnValueDeclarations(context))
  pushIndentedDeclarationLines(lines, emitStatusResultDeclarations(context))
  pushIndentedDeclarationLines(lines, emitLoopFlowDeclarations(context))
  pushIndentedDeclarationLines(lines, emitReturnFlowDeclarations(context))
  pushIndentedDeclarationLines(lines, emitEventLoopDeclarations(context))
  pushIndentedDeclarationLines(lines, emitOwnedValueDeclarations(context))
  pushIndentedDeclarationLines(lines, emitOwnedPromiseDeclarations(context))
  pushIndentedDeclarationLines(lines, emitErrorChannelDeclarations(context))
  pushIndentedDeclarationLines(lines, emitBoxedValueDeclarations(context))
  pushIndentedDeclarationLines(lines, emitEventLoopInit(context))

  if (needsCleanup) {
    pushScopedDeclarationBody(lines, bodyLines)
    lines.push('cleanup:')
    pushIndentedDeclarationLines(lines, emitThrowingFunctionErrorTransfer(context))
    pushIndentedDeclarationLines(lines, emitOwnedValueCleanup(context))
    pushIndentedDeclarationLines(lines, emitOwnedPromiseCleanup(context))
    pushIndentedDeclarationLines(lines, emitEventLoopCleanup(context))
    pushIndentedDeclarationLines(lines, emitBoxedValueCleanup(context))
    pushIndentedDeclarationLines(lines, emitCleanupReturn(context))
  } else if (context.returnType !== 'void') {
    pushDeclarationLines(lines, bodyLines)

    let returnValue = '0'
    const libraryCppType = libraryNativeBoundaryCppType(
      context.returnType,
      context.returnNullable === true,
      false,
      context.returnShape
    )

    if (libraryCppType !== null) {
      returnValue = `${libraryCppType}{}`
    } else if (isThrowingFunctionRuntimeOut(context)) {
      returnValue = 'inox_undefined_value()'
    }

    lines.push(`  return ${returnValue};`)
  } else {
    pushDeclarationLines(lines, bodyLines)
  }

  lines.push('}')

  return lines
}

export function emitClassConstructorDeclaration(
  info: CClassInfo,
  baseContext: CEmitContext,
  deps: CDeclarationEmissionDependencies
): string[] {
  if (!info.native) {
    return []
  }

  const constructorMethod = info.constructor

  if (constructorMethod === null || typeof constructorMethod === 'undefined') {
    return []
  }

  const initializerPlan = createNativeClassConstructorInitializerPlan(info, constructorMethod)
  const head = emitCClassConstructorHead(info, baseContext, initializerPlan.initializers)

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

  for (const statement of constructorMethod.body) {
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
  return classFieldUsesCppStringStorage(field) && classParamUsesCppStringStorage(param)
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
  context.throwingFunction = false
  context.externalEventLoop = false
  context.functionReturnOut = null
  context.functionErrorOut = null
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
  pushIndentedDeclarationLines(lines, emitStatusResultDeclarations(context))
  pushIndentedDeclarationLines(lines, emitLoopFlowDeclarations(context))
  pushIndentedDeclarationLines(lines, emitReturnFlowDeclarations(context))
  pushIndentedDeclarationLines(lines, emitEventLoopDeclarations(context))
  pushIndentedDeclarationLines(lines, emitOwnedValueDeclarations(context))
  pushIndentedDeclarationLines(lines, emitOwnedPromiseDeclarations(context))
  pushIndentedDeclarationLines(lines, emitErrorChannelDeclarations(context))
  pushIndentedDeclarationLines(lines, emitBoxedValueDeclarations(context))
  pushIndentedDeclarationLines(lines, emitEventLoopInit(context))

  if (needsCleanup) {
    pushScopedDeclarationBody(lines, bodyLines)
    lines.push('cleanup:')
    pushIndentedDeclarationLines(lines, emitOwnedValueCleanup(context))
    pushIndentedDeclarationLines(lines, emitOwnedPromiseCleanup(context))
    pushIndentedDeclarationLines(lines, emitEventLoopCleanup(context))
    pushIndentedDeclarationLines(lines, emitBoxedValueCleanup(context))
    pushIndentedDeclarationLines(lines, emitCleanupReturn(context))
  } else {
    pushDeclarationLines(lines, bodyLines)
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
  if (classParamUsesCppValueStorage(param) || classParamUsesCppStringStorage(param)) {
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

  if (isThrowingClassMethod(info, method, context)) {
    return `inox_status ${emitCIdentifier(method.name)}(${joinDeclarationParams(params)});`
  }

  return `${emitCReturnType(method.returnType, method.returnNullable, physicalReturnShape(method, method.returnShape, context))} ${emitCIdentifier(method.name)}(${joinDeclarationParams(
    params
  )});`
}

export function emitClassMethodHead(info: CClassInfo, method: CNode, context: CEmitContext): string {
  if (!info.native) {
    return emitRuntimeClassMethodHead(info, method, context)
  }

  const params = emitClassMethodParams(info, method, context)
  const name = `${emitCClassInfoTypeName(info)}::${emitCIdentifier(method.name)}`

  if (isThrowingClassMethod(info, method, context)) {
    return `inox_status ${name}(${joinDeclarationParams(params)})`
  }

  return `${emitCReturnType(method.returnType, method.returnNullable, physicalReturnShape(method, method.returnShape, context))} ${name}(${joinDeclarationParams(params)})`
}

function emitRuntimeClassMethodHead(info: CClassInfo, method: CNode, context: CEmitContext): string {
  const params = emitRuntimeClassMethodParams(info, method, context)
  const name = emitCClassInfoMethodName(info, method.name)

  if (isThrowingClassMethod(info, method, context)) {
    return `static inox_status ${name}(${joinDeclarationParams(params)})`
  }

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
    pushObjectFunctionFieldParams(params, method.params[index], context)
  }

  if (isThrowingClassMethod(info, method, context)) {
    if (method.returnType !== 'void') {
      params.push(
        `${emitThrowingFunctionOutType(method.returnType, method.returnNullable === true, physicalReturnShape(method, method.returnShape, context))}* inox_out`
      )
    }

    params.push('inox_value* inox_error_out')
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
    pushObjectFunctionFieldParams(params, method.params[index], context)
  }

  if (isThrowingClassMethod(info, method, context)) {
    if (method.returnType !== 'void') {
      params.push(
        `${emitThrowingFunctionOutType(method.returnType, method.returnNullable === true, physicalReturnShape(method, method.returnShape, context))}* inox_out`
      )
    }

    params.push('inox_value* inox_error_out')
  }

  return params
}

function isThrowingClassMethod(info: CClassInfo, method: CNode, context: CEmitContext): boolean {
  const methodEffectName = `${info.name}.${method.name}`
  return isThrowingFunctionName(methodEffectName, context)
}

function emitClassMethodParam(param: CFunctionParam, index: number, method: CNode, context: CEmitContext): string {
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

  if (param.valueType === 'array') {
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

  return fallback ?? null
}

function hasPhysicalNativeReturn(declaration: CNode, context: CEmitContext): boolean {
  return !cBooleanValueIsTrue(declaration.async) && cTypeRefNativeShape(declaration.returnTypeRef, context.libraries) !== null
}

function resolveCFunctionReturnInfo(statement: CNode, context: CEmitContext): CFunctionReturnInfo {
  const returnType = resolveFunctionReturnType(statement.name, statement.returnType, context)
  const returnNullable = resolveFunctionReturnNullable(statement.name, statement.returnNullable, context)
  const declaredPromiseValueType: string | null | undefined = statement.returnPromiseValueType

  if (cBooleanValueIsTrue(context.functionAsyncFlags.get(statement.name)) && returnType === 'promise') {
    let promiseValueType = context.functionReturnPromiseValueTypes.get(statement.name)

    if (promiseValueType === null || typeof promiseValueType === 'undefined') {
      promiseValueType = declaredPromiseValueType
    }

    if (promiseValueType === null || typeof promiseValueType === 'undefined') {
      promiseValueType = 'void'
    }

    return {
      returnType: promiseValueType,
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

  lines.push('static void inox_main(void) {')
  pushIndentedDeclarationLines(lines, emitLoopFlowDeclarations(context))
  pushIndentedDeclarationLines(lines, emitMainReturnValueDeclarations(context))
  pushIndentedDeclarationLines(lines, emitReturnFlowDeclarations(context))
  pushIndentedDeclarationLines(lines, emitOwnedValueDeclarations(context))
  pushIndentedDeclarationLines(lines, emitOwnedPromiseDeclarations(context))
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
    lines.push('int main(void) {')
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

  if (libraryNativeParamCppType(param, context) !== null || isNativeClassParam(param, context)) {
    return lines
  }

  pushDeclarationLines(lines, emitDefaultRuntimeParamPreludeForParam(param, context, deps))

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
    lines.push(`${localName} = (inox_value*)inox_default_alloc(0, sizeof(inox_value), _Alignof(inox_value));`)
    lines.push(`if (${localName} == 0) ${emitFailureStatement(context)}`)
    lines.push(`*${localName} = ${paramName};`)
    lines.push(`inox_retain(*${localName});`)
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
    if (libraryNativeCppType(param.shape) !== null) {
      return lines
    }

    if (param.nullable === true || param.optional === true) {
      pushDeclarationLines(lines, emitRuntimeNullableValueCheck(localName, 'INOX_TAG_OBJECT', context))
      return lines
    }

    lines.push(emitRuntimeValueCheck(localName, 'INOX_TAG_OBJECT', context))
    return lines
  }

  if (param.valueType === 'array') {
    const tag = cRuntimeValueTag(param.valueType)

    if (param.nullable === true || param.optional === true) {
      pushDeclarationLines(lines, emitRuntimeNullableValueCheck(localName, tag, context))
      return lines
    }

    lines.push(emitRuntimeTypeCheck(`${localName}.tag != ${tag} || ${localName}.as.ref == 0`, context))
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
    lines.push(`${localName} = (double*)inox_default_alloc(0, sizeof(double), _Alignof(double));`)
    lines.push(`if (${localName} == 0) ${emitFailureStatement(context)}`)
    lines.push(`*${localName} = ${emitCScalarParamName(param.name)};`)
  }

  return lines
}

function libraryNativeParamCppType(param: CFunctionParam, context: CEmitContext): string | null {
  const cppType = libraryNativeBoundaryCppType(
    param.valueType,
    param.nullable === true,
    param.optional === true,
    param.shape
  )

  if (cppType !== null || param.valueType !== 'promise') {
    return cppType
  }

  return requireCompilerLibraryAsyncResultCppType(context.libraries, param.typeRef)
}

function isNativeClassParam(param: CFunctionParam, context: CFunctionContext): boolean {
  return nativeClassParamName(param, context) !== null
}

function nativeClassParamName(param: CFunctionParam, context: CFunctionContext): string | null {
  const className = param.className

  if (className === null || typeof className === 'undefined') {
    return null
  }

  const info = context.classInfos.get(className)

  if (info === null || typeof info === 'undefined' || !info.native) {
    return null
  }

  return className
}

function emitDefaultRuntimeParamPreludeForParam(
  param: CFunctionParam,
  context: CFunctionContext,
  deps: CDeclarationEmissionDependencies
): string[] {
  const value = param.defaultValue
  const localName = emitCLocalName(param.name)

  if (
    param.valueType === 'number' &&
    value !== null &&
    typeof value !== 'undefined' &&
    param.optional === true
  ) {
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
      `static const inox_shape ${shapeName} = {`,
      '  0,',
      `  ${fieldsName}`,
      '};',
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

  if (
    param.valueType === 'array' &&
    value !== null &&
    typeof value !== 'undefined' &&
    value.type === 'ArrayLiteral' &&
    value.elements.length === 0
  ) {
    const temp = nextCName(context, `${param.name}_default`)
    const cppType = compilerLibraryIntrinsicNativeCppType(context.libraries, 'array-literal') ?? 'inox::Value'
    registerOwnedValue(context, temp)

    return [
      `if (${localName}.tag == INOX_TAG_UNDEFINED) {`,
      `  ${temp} = ${cppType}::create(0);`,
      `  if (inox::thrown()) ${emitFailureStatement(context)}`,
      `  ${localName} = ${temp};`,
      '}'
    ]
  }

  return []
}

function emitThrowingFunctionPrelude(context: CFunctionContext): string[] {
  if (!context.throwingFunction) {
    return []
  }

  const lines: string[] = []
  let guard = `if (${context.functionErrorOut} == 0`

  if (context.returnType !== 'void') {
    guard = `${guard} || ${context.functionReturnOut} == 0`
  }

  lines.push(`${guard}) return INOX_ERR_TYPE;`)
  lines.push(`*${context.functionErrorOut} = inox_undefined_value();`)

  if (context.returnType !== 'void') {
    let returnValue = '0'

    const libraryCppType = libraryNativeBoundaryCppType(
      context.returnType,
      context.returnNullable === true,
      false,
      context.returnShape
    )

    if (libraryCppType !== null) {
      returnValue = `${libraryCppType}{}`
    } else if (isThrowingFunctionRuntimeOut(context)) {
      returnValue = 'inox_undefined_value()'
    }

    lines.push(`*${context.functionReturnOut} = ${returnValue};`)
  }

  return lines
}
