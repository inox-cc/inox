import { diagnostic } from '../diagnostics.ts'
import { collectIrTopLevelNodesFromPrograms } from '../ir.ts'
import type { AnyNode as CNode, IrProgram, SourceLocation } from '../types.ts'
import { functionTakesEventLoopParam } from './async/promises.ts'
import {
  emitFunctionPointerParams,
  emitFunctionPointerReturnType,
  isPlainFunctionPointerType,
  isRuntimeFunctionType,
  normalizeFunctionType,
  resolveFunctionParameterRuntimeType
} from './async/callbacks.ts'
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
  emitOwnedPromiseCleanup,
  emitOwnedPromiseDeclarations,
  emitOwnedValueCleanup,
  emitOwnedValueDeclarations,
  emitReturnFlowDeclarations,
  emitReturnValueDeclarations,
  emitRuntimeTypeCheck,
  emitStatusResultDeclarations,
  emitThrowingFunctionErrorTransfer,
  registerBoxedValue,
  shouldEmitCleanupLabel
} from './context.ts'
import type { CEmitContext, CFunctionContext } from './context.ts'
import { registerErrorChannel } from './values/statements.ts'
import { emitRuntimeNullableValueCheck } from './runtime-values.ts'
import { emitAsyncTaskFunctionStubDeclaration } from './async/tasks.ts'
import type { AsyncTaskLoweringDependencies } from './async/tasks.ts'
import { emitCClassMethodName, registerClassObjectShape } from './values/classes.ts'
import { registerObjectShape } from './values/objects.ts'
import {
  cRuntimeValueTag,
  emitCObjectParamName,
  emitCReturnType,
  emitCScalarParamName,
  emitCStringParamName,
  emitCType,
  emitThrowingFunctionOutType,
  isNullableScalarParam,
  isOpaqueRuntimeValueType,
  isRuntimeNullableType,
  isThrowingFunctionRuntimeOut
} from './value-types.ts'
import { emitCFunctionName, emitCObjectFunctionFieldName } from './identifiers.ts'
import { isThrowingFunctionName } from './values/expressions.ts'
import type { CClassInfo, CFunctionParam, CFunctionType, CObjectShape, CObjectShapeField } from './types.ts'

type CSourceLocation = SourceLocation | null | undefined

type CFunctionReturnInfo = {
  returnType: string
  returnNullable: boolean
}

export type CDeclarationEmissionDependencies = {
  asyncTaskLoweringDependencies: AsyncTaskLoweringDependencies
  emitStatementList: (statements: CNode[], context: CFunctionContext) => string[]
}

function cBooleanValueIsTrue(value: boolean | null | undefined): boolean {
  if (value == null) {
    return false
  }

  if (value) {
    return true
  }

  return false
}

export function resolveFunctionReturnType(name: string, fallback: string, context: CEmitContext): string {
  const returnType = context.functionReturnTypes.get(name)

  if (returnType != null) {
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

  if (params != null) {
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
    target.push(`  ${line}`)
  }
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
  if (value != null) {
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

function isBoxedFunctionParam(param: CFunctionParam, index: number, statement: CNode, context: CEmitContext): boolean {
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
  const context = createFunctionContext(baseContext, returnType, returnNullable)
  const returnShape = context.functionReturnShapes.get(statement.name)

  if (returnShape != null) {
    context.returnShape = returnShape
  } else {
    context.returnShape = null
  }

  context.throwingFunction = isThrowingFunctionName(statement.name, context)
  context.externalEventLoop = functionTakesEventLoopParam(statement.name, context)
  context.functionReturnOut = 'ccjs_out'
  context.functionErrorOut = 'ccjs_error_out'

  if (baseContext.asyncTaskWrappers.has(statement.name)) {
    return emitAsyncTaskFunctionStubDeclaration(statement, context, deps.asyncTaskLoweringDependencies)
  }

  if (context.throwingFunction) {
    registerErrorChannel(context)
  }

  registerFunctionParamsInContext(statement, params, context)

  const bodyLines: string[] = []
  const lines: string[] = []

  pushIndentedDeclarationLines(bodyLines, emitRuntimeParamPreludeForParams(statement, params, context))
  pushIndentedDeclarationLines(bodyLines, deps.emitStatementList(statement.body, context))

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
  pushDeclarationLines(lines, bodyLines)

  if (shouldEmitCleanupLabel(context)) {
    lines.push('ccjs_cleanup:')
    pushIndentedDeclarationLines(lines, emitThrowingFunctionErrorTransfer(context))
    pushIndentedDeclarationLines(lines, emitOwnedValueCleanup(context))
    pushIndentedDeclarationLines(lines, emitOwnedPromiseCleanup(context))
    pushIndentedDeclarationLines(lines, emitEventLoopCleanup(context))
    pushIndentedDeclarationLines(lines, emitBoxedValueCleanup(context))
    pushIndentedDeclarationLines(lines, emitCleanupReturn(context))
  } else if (context.returnType !== 'void') {
    let returnValue = '0'

    if (context.returnType === 'string') {
      returnValue = '""'
    }

    lines.push(`  return ${returnValue};`)
  }

  lines.push('}')

  return lines
}

function registerFunctionParamsInContext(statement: CNode, params: CFunctionParam[], context: CFunctionContext): void {
  for (let index = 0; index < params.length; index = index + 1) {
    const param = params[index]

    if (param.nullable === true && isRuntimeNullableType(param.valueType)) {
      context.nullableVariables.add(param.name)
    }

    if (isNullableScalarParam(param)) {
      context.variables.set(param.name, param.valueType)
    } else if (
      isBoxedFunctionParam(param, index, statement, context) &&
      isBoxedParamValueType(param.valueType)
    ) {
      context.variables.set(param.name, param.valueType)
      context.boxedVariables.add(param.name)
      registerBoxedValue(context, param.name, param.valueType)

      if (param.valueType === 'object') {
        registerObjectShape(context, param.name, param.shape)
      }
    } else if (param.valueType === 'string') {
      context.variables.set(param.name, 'string')
      context.runtimeStrings.add(param.name)
    } else if (param.valueType === 'object') {
      context.variables.set(param.name, 'object')
      registerObjectShape(context, param.name, param.shape)
    } else if (param.valueType === 'array') {
      context.variables.set(param.name, 'array')
      context.runtimeArrayElementTypes.set(param.name, declarationTypeOrUnknown(param.arrayElementType))
    } else if (param.valueType === 'map') {
      context.variables.set(param.name, 'map')
      context.mapTypes.set(param.name, {
        key: declarationTypeOrUnknown(param.mapKeyType),
        value: declarationTypeOrUnknown(param.mapValueType)
      })
    } else if (param.valueType === 'set') {
      context.variables.set(param.name, 'set')
      context.setElementTypes.set(param.name, declarationTypeOrUnknown(param.setElementType))
    } else if (param.valueType === 'promise') {
      context.variables.set(param.name, 'promise')
      context.promiseValueTypes.set(param.name, declarationTypeOrUnknown(param.promiseValueType))
    } else if (param.valueType === 'function') {
      const runtimeFunctionType = resolveFunctionParameterRuntimeType(statement.name, index, param, context)
      let functionType = param.functionType

      if (runtimeFunctionType != null) {
        functionType = runtimeFunctionType
      }

      context.variables.set(param.name, 'function')
      context.functionTypes.set(param.name, normalizeFunctionType(functionType))

      if (param.nullable === true) {
        context.nullableVariables.add(param.name)
      }

      if (runtimeFunctionType != null) {
        context.runtimeCallbacks.add(param.name)
      }
    } else if (isOpaqueRuntimeValueType(param.valueType)) {
      context.variables.set(param.name, 'unknown')
    } else {
      context.variables.set(param.name, param.valueType)
    }
  }
}

export function emitFunctionHead(statement: CNode, context: CEmitContext): string {
  let name = context.functionNames.get(statement.name)

  if (name == null) {
    name = emitCFunctionName(statement.name)
  }

  const returnInfo = resolveCFunctionReturnInfo(statement, context)
  const returnType = returnInfo.returnType
  const returnNullable = returnInfo.returnNullable
  const functionParams = resolveFunctionDeclarationParams(statement.name, statement.params, context)
  const params: string[] = []

  for (let index = 0; index < functionParams.length; index = index + 1) {
    pushFunctionHeadParam(params, functionParams[index], index, statement, context)
  }

  if (functionTakesEventLoopParam(statement.name, context)) {
    params.unshift('ccjs_loop* ccjs_loop')
  }

  if (isThrowingFunctionName(statement.name, context)) {
    if (returnType !== 'void') {
      params.push(`${emitThrowingFunctionOutType(returnType, returnNullable)}* ccjs_out`)
    }

    params.push('ccjs_value* ccjs_error_out')

    return `ccjs_status ${name}(${declarationParamList(params)})`
  }

  return `${emitCReturnType(returnType, returnNullable)} ${name}(${declarationParamList(params)})`
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

  pushObjectShapeFunctionFieldParams(params, param.name, param.shape, context, param.loc)
}

function pushObjectShapeFunctionFieldParams(
  params: string[],
  objectName: string,
  shape: CObjectShape | null | undefined,
  context: CEmitContext,
  loc: CSourceLocation
): void {
  const fields = shape?.fields

  if (fields == null) {
    return
  }

  for (const field of fields) {
    if (field.valueType === 'function') {
      params.push(emitObjectFunctionFieldParam(objectName, field, context, loc))
    } else if (field.valueType === 'object') {
      pushObjectShapeFunctionFieldParams(params, `${objectName}_${field.name}`, field.shape, context, field.loc ?? loc)
    }
  }
}

function emitObjectFunctionFieldParam(
  objectName: string,
  field: CObjectShapeField,
  context: CEmitContext,
  loc: CSourceLocation
): string {
  return emitFunctionParameter(
    emitCObjectFunctionFieldName(objectName, field.name),
    field.functionType,
    context,
    field.loc ?? loc
  )
}

function emitFunctionHeadParam(
  param: CFunctionParam,
  index: number,
  statement: CNode,
  context: CEmitContext
): string {
  if (isNullableScalarParam(param)) {
    return `ccjs_value ${emitCScalarParamName(param.name)}`
  }

  if (param.valueType === 'string') {
    return `ccjs_value ${emitCStringParamName(param.name)}`
  }

  if (param.valueType === 'object') {
    if (isBoxedFunctionParam(param, index, statement, context)) {
      return `ccjs_value ${emitCObjectParamName(param.name)}`
    }

    return `ccjs_value ${param.name}`
  }

  if (param.valueType === 'array' || param.valueType === 'map' || param.valueType === 'set') {
    return `ccjs_value ${param.name}`
  }

  if (param.valueType === 'function') {
    if (resolveFunctionParameterRuntimeType(statement.name, index, param, context) != null) {
      return `ccjs_value ${param.name}`
    }

    return emitFunctionParameter(param.name, param.functionType, context, param.loc)
  }

  if (isBoxedFunctionParam(param, index, statement, context) && isBoxedScalarParamValueType(param.valueType)) {
    return `${emitCType(param.valueType)} ${emitCScalarParamName(param.name)}`
  }

  return `${emitCType(param.valueType)} ${param.name}`
}

export function emitClassMethodDeclaration(
  info: CClassInfo,
  method: CNode,
  baseContext: CEmitContext,
  deps: CDeclarationEmissionDependencies
): string[] {
  const context = createFunctionContext(baseContext, method.returnType, method.returnNullable)
  const params = method.params

  context.returnShape = null
  context.functionReturnOut = 'ccjs_out'
  context.functionErrorOut = 'ccjs_error_out'
  context.variables.set('this', 'object')
  context.classInstanceTypes.set('this', info.name)
  registerClassObjectShape(context, 'this', info)
  registerFunctionParamsInContext(method, params, context)

  const bodyLines: string[] = []
  const lines: string[] = []

  pushIndentedDeclarationLines(bodyLines, emitRuntimeParamPreludeForParams(method, params, context))
  pushIndentedDeclarationLines(bodyLines, deps.emitStatementList(method.body, context))

  lines.push(`${emitClassMethodHead(info, method, context)} {`)
  pushIndentedDeclarationLines(lines, emitReturnValueDeclarations(context))
  pushIndentedDeclarationLines(lines, emitStatusResultDeclarations(context))
  pushIndentedDeclarationLines(lines, emitLoopFlowDeclarations(context))
  pushIndentedDeclarationLines(lines, emitReturnFlowDeclarations(context))
  pushIndentedDeclarationLines(lines, emitOwnedValueDeclarations(context))
  pushIndentedDeclarationLines(lines, emitOwnedPromiseDeclarations(context))
  pushIndentedDeclarationLines(lines, emitErrorChannelDeclarations(context))
  pushIndentedDeclarationLines(lines, emitBoxedValueDeclarations(context))
  pushDeclarationLines(lines, bodyLines)

  if (shouldEmitCleanupLabel(context)) {
    lines.push('ccjs_cleanup:')
    pushIndentedDeclarationLines(lines, emitOwnedValueCleanup(context))
    pushIndentedDeclarationLines(lines, emitOwnedPromiseCleanup(context))
    pushIndentedDeclarationLines(lines, emitBoxedValueCleanup(context))
    pushIndentedDeclarationLines(lines, emitCleanupReturn(context))
  } else if (context.returnType !== 'void') {
    let returnValue = '0'

    if (context.returnType === 'string') {
      returnValue = 'ccjs_undefined_value()'
    }

    lines.push(`  return ${returnValue};`)
  }

  lines.push('}')

  return lines
}

export function emitClassMethodHead(info: CClassInfo, method: CNode, context: CEmitContext): string {
  const params = ['ccjs_value this']

  for (let index = 0; index < method.params.length; index = index + 1) {
    params.push(emitClassMethodParam(method.params[index], index, method, context))
    pushObjectFunctionFieldParams(params, method.params[index], context)
  }

  return `static ${emitCReturnType(method.returnType, method.returnNullable)} ${emitCClassMethodName(info.name, method.name)}(${joinDeclarationParams(params)})`
}

function emitClassMethodParam(param: CFunctionParam, index: number, method: CNode, context: CEmitContext): string {
  if (isNullableScalarParam(param)) {
    return `ccjs_value ${emitCScalarParamName(param.name)}`
  }

  if (param.valueType === 'string') {
    return `ccjs_value ${emitCStringParamName(param.name)}`
  }

  if (param.valueType === 'object') {
    if (isBoxedFunctionParam(param, index, method, context)) {
      return `ccjs_value ${emitCObjectParamName(param.name)}`
    }

    return `ccjs_value ${param.name}`
  }

  if (param.valueType === 'array' || param.valueType === 'map' || param.valueType === 'set') {
    return `ccjs_value ${param.name}`
  }

  if (param.valueType === 'function') {
    if (resolveFunctionParameterRuntimeType(method.name, index, param, context) != null) {
      return `ccjs_value ${param.name}`
    }

    return emitFunctionParameter(param.name, param.functionType, context, param.loc)
  }

  if (isBoxedFunctionParam(param, index, method, context) && isBoxedScalarParamValueType(param.valueType)) {
    return `${emitCType(param.valueType)} ${emitCScalarParamName(param.name)}`
  }

  return `${emitCType(param.valueType)} ${param.name}`
}

function resolveCFunctionReturnInfo(
  statement: CNode,
  context: CEmitContext
): CFunctionReturnInfo {
  const returnType = resolveFunctionReturnType(statement.name, statement.returnType, context)
  const returnNullable = resolveFunctionReturnNullable(statement.name, statement.returnNullable, context)

  if (cBooleanValueIsTrue(context.functionAsyncFlags.get(statement.name)) && returnType === 'promise') {
    let promiseValueType = context.functionReturnPromiseValueTypes.get(statement.name)

    if (promiseValueType == null) {
      promiseValueType = statement.returnPromiseValueType
    }

    if (promiseValueType == null) {
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
  loc: CSourceLocation
): string {
  reportUnsupportedCFunctionType(functionType, context, loc)

  if (isRuntimeFunctionType(functionType)) {
    return `ccjs_value ${name}`
  }

  return emitFunctionPointerParameter(name, functionType)
}

export function emitFunctionPointerParameter(name: string, functionType: CFunctionType | null | undefined): string {
  return `${emitFunctionPointerReturnType(functionType)} (*${name})(${emitFunctionPointerParams(functionType)})`
}

export function reportUnsupportedCFunctionType(
  functionType: CFunctionType | null | undefined,
  context: CEmitContext,
  loc: CSourceLocation
): void {
  if (functionType == null) {
    return
  }

  if (isPlainFunctionPointerType(functionType) || isRuntimeFunctionType(functionType)) {
    return
  }

  context.diagnostics.push(
    diagnostic(
      'CCJS_C_FUNCTION_VALUE',
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
  const context = createFunctionContext(baseContext, 'number', false)
  const body = collectIrTopLevelNodesFromPrograms(irPrograms, 'statement')
  const bodyLines: string[] = []
  const lines: string[] = []

  if (context.processRuntime) {
    lines.push('int main(int argc, char** argv) {')
  } else {
    lines.push('int main(void) {')
  }

  pushIndentedDeclarationLines(bodyLines, deps.emitStatementList(body, context))

  if (context.processRuntime) {
    lines.push('  ccjs_process_init(argc, argv);')
  }
  pushIndentedDeclarationLines(lines, emitLoopFlowDeclarations(context))
  pushIndentedDeclarationLines(lines, emitReturnValueDeclarations(context))
  pushIndentedDeclarationLines(lines, emitReturnFlowDeclarations(context))
  pushIndentedDeclarationLines(lines, emitEventLoopDeclarations(context))
  pushIndentedDeclarationLines(lines, emitOwnedValueDeclarations(context))
  pushIndentedDeclarationLines(lines, emitOwnedPromiseDeclarations(context))
  pushIndentedDeclarationLines(lines, emitErrorChannelDeclarations(context))
  pushIndentedDeclarationLines(lines, emitBoxedValueDeclarations(context))
  pushIndentedDeclarationLines(lines, emitEventLoopInit(context))
  pushDeclarationLines(lines, bodyLines)
  pushIndentedDeclarationLines(lines, emitEventLoopDrain(context))

  if (shouldEmitCleanupLabel(context)) {
    lines.push('ccjs_cleanup:')
    pushIndentedDeclarationLines(lines, emitOwnedValueCleanup(context))
    pushIndentedDeclarationLines(lines, emitOwnedPromiseCleanup(context))
    pushIndentedDeclarationLines(lines, emitEventLoopCleanup(context))
    pushIndentedDeclarationLines(lines, emitBoxedValueCleanup(context))
  }

  lines.push(`  return ${emitMainReturnExpression(context)};`)
  lines.push('}')

  return lines
}

export function emitMainReturnExpression(context: CFunctionContext): string {
  let successReturn = '0'

  if (context.processRuntime) {
    successReturn = 'ccjs_process_get_exit_code()'
  } else if (context.returnType === 'number') {
    successReturn = '(int)ccjs_return'
  }

  if (context.unhandledRejectionFlag == null) {
    return successReturn
  }

  return `${context.unhandledRejectionFlag} == 0 ? ${successReturn} : 1`
}

function emitRuntimeParamPreludeForParams(statement: CNode, params: CFunctionParam[], context: CFunctionContext): string[] {
  const lines: string[] = []

  for (let index = 0; index < params.length; index = index + 1) {
    pushDeclarationLines(lines, emitRuntimeParamPreludeForParam(statement, params[index], index, context))
  }

  return lines
}

function emitRuntimeParamPreludeForParam(
  statement: CNode,
  param: CFunctionParam,
  index: number,
  context: CFunctionContext
): string[] {
  const lines: string[] = []

  if (isNullableScalarParam(param)) {
    const paramName = emitCScalarParamName(param.name)
    const expectedTag = cRuntimeValueTag(param.valueType)

    pushDeclarationLines(lines, emitRuntimeNullableValueCheck(paramName, expectedTag, context))
    lines.push(`ccjs_value ${param.name} = ${paramName};`)
    return lines
  }

  if (isBoxedFunctionParam(param, index, statement, context) && isBoxedRuntimeValueParamType(param.valueType)) {
    let paramName = emitCObjectParamName(param.name)
    let tag = 'CCJS_TAG_OBJECT'

    if (param.valueType === 'string') {
      paramName = emitCStringParamName(param.name)
      tag = 'CCJS_TAG_STRING'
    }

    lines.push(emitRuntimeTypeCheck(`${paramName}.tag != ${tag} || ${paramName}.as.ref == 0`, context))
    lines.push(`${param.name} = ccjs_default_alloc(0, sizeof(ccjs_value), _Alignof(ccjs_value));`)
    lines.push(`if (${param.name} == 0) ${emitFailureStatement(context)}`)
    lines.push(`*${param.name} = ${paramName};`)
    lines.push(`ccjs_retain(*${param.name});`)
    return lines
  }

  if (param.valueType === 'string') {
    const paramName = emitCStringParamName(param.name)

    lines.push(emitRuntimeTypeCheck(`${paramName}.tag != CCJS_TAG_STRING || ${paramName}.as.ref == 0`, context))
    lines.push(`ccjs_string* ${param.name} = (ccjs_string*)${paramName}.as.ref;`)
    return lines
  }

  if (param.valueType === 'object') {
    if (param.nullable === true) {
      return emitRuntimeNullableValueCheck(param.name, 'CCJS_TAG_OBJECT', context)
    }

    lines.push(emitRuntimeTypeCheck(`${param.name}.tag != CCJS_TAG_OBJECT || ${param.name}.as.ref == 0`, context))
    return lines
  }

  if (param.valueType === 'array' || param.valueType === 'map' || param.valueType === 'set') {
    const tag = cRuntimeValueTag(param.valueType)

    if (param.nullable === true) {
      return emitRuntimeNullableValueCheck(param.name, tag, context)
    }

    lines.push(emitRuntimeTypeCheck(`${param.name}.tag != ${tag} || ${param.name}.as.ref == 0`, context))
    return lines
  }

  if (
    param.valueType === 'function' &&
    resolveFunctionParameterRuntimeType(statement.name, index, param, context) != null
  ) {
    if (param.nullable === true) {
      return emitRuntimeNullableValueCheck(param.name, 'CCJS_TAG_FUNCTION', context)
    }

    lines.push(emitRuntimeTypeCheck(`${param.name}.tag != CCJS_TAG_FUNCTION || ${param.name}.as.ref == 0`, context))
    return lines
  }

  if (isBoxedFunctionParam(param, index, statement, context) && isBoxedScalarParamValueType(param.valueType)) {
    lines.push(`${param.name} = ccjs_default_alloc(0, sizeof(double), _Alignof(double));`)
    lines.push(`if (${param.name} == 0) ${emitFailureStatement(context)}`)
    lines.push(`*${param.name} = ${emitCScalarParamName(param.name)};`)
  }

  return lines
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

  lines.push(`${guard}) return CCJS_ERR_TYPE;`)
  lines.push(`*${context.functionErrorOut} = ccjs_undefined_value();`)

  if (context.returnType !== 'void') {
    let returnValue = '0'

    if (isThrowingFunctionRuntimeOut(context)) {
      returnValue = 'ccjs_undefined_value()'
    }

    lines.push(`*${context.functionReturnOut} = ${returnValue};`)
  }

  return lines
}
