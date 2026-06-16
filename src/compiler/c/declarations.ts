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
  shouldEmitCleanupLabel,
  type CEmitContext,
  type CFunctionContext
} from './context.ts'
import { registerErrorChannel } from './values/statements.ts'
import { emitRuntimeNullableValueCheck } from './runtime-values.ts'
import { emitAsyncTaskFunctionStubDeclaration, type AsyncTaskLoweringDependencies } from './async/tasks.ts'
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
  isRuntimeNullableType,
  isThrowingFunctionRuntimeOut
} from './value-types.ts'
import { emitCFunctionName } from './identifiers.ts'
import { isThrowingFunctionName } from './values/expressions.ts'
import type { CClassInfo, CFunctionParam, CFunctionType } from './types.ts'

type CSourceLocation = SourceLocation | null | undefined

export type CDeclarationEmissionDependencies = {
  asyncTaskLoweringDependencies: AsyncTaskLoweringDependencies
  emitStatementList: (statements: CNode[], context: CFunctionContext) => string[]
}

export function resolveFunctionReturnType(name: string, fallback: string, context: CEmitContext): string {
  return context.functionReturnTypes.get(name) ?? fallback
}

export function resolveFunctionReturnNullable(name: string, fallback: boolean, context: CEmitContext): boolean {
  return context.functionReturnNullables.has(name)
    ? context.functionReturnNullables.get(name) === true
    : fallback === true
}

export function resolveFunctionDeclarationParams(
  name: string,
  fallback: CFunctionParam[],
  context: CEmitContext
): CFunctionParam[] {
  return context.functionParams.get(name) ?? fallback
}

function isBoxedFunctionParam(param: CFunctionParam, index: number, statement: CNode, context: CEmitContext): boolean {
  return context.boxedMutableCaptureDeclarations.has(statement.params[index] ?? param)
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
  context.returnShape = context.functionReturnShapes.get(statement.name) ?? null
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

  bodyLines.push(...emitRuntimeParamPreludeForParams(statement, params, context).map((line: string) => `  ${line}`))

  bodyLines.push(...deps.emitStatementList(statement.body, context).map((line: string) => `  ${line}`))

  const lines = [
    `${emitFunctionHead(statement, context)} {`,
    ...emitThrowingFunctionPrelude(context).map((line: string) => `  ${line}`),
    ...emitReturnValueDeclarations(context).map((line: string) => `  ${line}`),
    ...emitStatusResultDeclarations(context).map((line: string) => `  ${line}`),
    ...emitLoopFlowDeclarations(context).map((line: string) => `  ${line}`),
    ...emitReturnFlowDeclarations(context).map((line: string) => `  ${line}`),
    ...emitEventLoopDeclarations(context).map((line: string) => `  ${line}`),
    ...emitOwnedValueDeclarations(context).map((line: string) => `  ${line}`),
    ...emitOwnedPromiseDeclarations(context).map((line: string) => `  ${line}`),
    ...emitErrorChannelDeclarations(context).map((line: string) => `  ${line}`),
    ...emitBoxedValueDeclarations(context).map((line: string) => `  ${line}`),
    ...emitEventLoopInit(context).map((line: string) => `  ${line}`),
    ...bodyLines
  ]

  if (shouldEmitCleanupLabel(context)) {
    lines.push('ccjs_cleanup:')
    lines.push(...emitThrowingFunctionErrorTransfer(context).map((line: string) => `  ${line}`))
    lines.push(...emitOwnedValueCleanup(context).map((line: string) => `  ${line}`))
    lines.push(...emitOwnedPromiseCleanup(context).map((line: string) => `  ${line}`))
    lines.push(...emitEventLoopCleanup(context).map((line: string) => `  ${line}`))
    lines.push(...emitBoxedValueCleanup(context).map((line: string) => `  ${line}`))
    lines.push(...emitCleanupReturn(context).map((line: string) => `  ${line}`))
  } else if (context.returnType !== 'void') {
    lines.push(`  return ${context.returnType === 'string' ? '""' : '0'};`)
  }

  lines.push('}')

  return lines
}

function registerFunctionParamsInContext(statement: CNode, params: CFunctionParam[], context: CFunctionContext): void {
  for (const [index, param] of params.entries()) {
    if (param.nullable === true && isRuntimeNullableType(param.valueType)) {
      context.nullableVariables.add(param.name)
    }

    if (isNullableScalarParam(param)) {
      context.variables.set(param.name, param.valueType)
    } else if (
      isBoxedFunctionParam(param, index, statement, context) &&
      ['number', 'boolean', 'string', 'object'].includes(param.valueType)
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
      context.runtimeArrayElementTypes.set(param.name, param.arrayElementType ?? 'unknown')
    } else if (param.valueType === 'map') {
      context.variables.set(param.name, 'map')
      context.mapTypes.set(param.name, {
        key: param.mapKeyType ?? 'unknown',
        value: param.mapValueType ?? 'unknown'
      })
    } else if (param.valueType === 'set') {
      context.variables.set(param.name, 'set')
      context.setElementTypes.set(param.name, param.setElementType ?? 'unknown')
    } else if (param.valueType === 'promise') {
      context.variables.set(param.name, 'promise')
      context.promiseValueTypes.set(param.name, param.promiseValueType ?? 'unknown')
    } else if (param.valueType === 'function') {
      const runtimeFunctionType = resolveFunctionParameterRuntimeType(statement.name, index, param, context)

      context.variables.set(param.name, 'function')
      context.functionTypes.set(param.name, normalizeFunctionType(runtimeFunctionType ?? param.functionType))

      if (param.nullable === true) {
        context.nullableVariables.add(param.name)
      }

      if (runtimeFunctionType != null) {
        context.runtimeCallbacks.add(param.name)
      }
    } else {
      context.variables.set(param.name, param.valueType)
    }
  }
}

export function emitFunctionHead(statement: CNode, context: CEmitContext): string {
  const name = context.functionNames.get(statement.name) ?? emitCFunctionName(statement.name)
  const returnInfo = resolveCFunctionReturnInfo(statement, context)
  const returnType = returnInfo.returnType
  const returnNullable = returnInfo.returnNullable
  const functionParams = resolveFunctionDeclarationParams(statement.name, statement.params, context)
  const params = functionParams.map((param: CFunctionParam, index: number) => {
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

    if (isBoxedFunctionParam(param, index, statement, context) && ['number', 'boolean'].includes(param.valueType)) {
      return `${emitCType(param.valueType)} ${emitCScalarParamName(param.name)}`
    }

    return `${emitCType(param.valueType)} ${param.name}`
  })

  if (functionTakesEventLoopParam(statement.name, context)) {
    params.unshift('ccjs_loop* ccjs_loop')
  }

  if (isThrowingFunctionName(statement.name, context)) {
    if (returnType !== 'void') {
      params.push(`${emitThrowingFunctionOutType(returnType, returnNullable)}* ccjs_out`)
    }

    params.push('ccjs_value* ccjs_error_out')

    return `ccjs_status ${name}(${params.length === 0 ? 'void' : params.join(', ')})`
  }

  return `${emitCReturnType(returnType, returnNullable)} ${name}(${params.length === 0 ? 'void' : params.join(', ')})`
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

  bodyLines.push(...emitRuntimeParamPreludeForParams(method, params, context).map((line: string) => `  ${line}`))
  bodyLines.push(...deps.emitStatementList(method.body, context).map((line: string) => `  ${line}`))

  const lines = [
    `${emitClassMethodHead(info, method, context)} {`,
    ...emitReturnValueDeclarations(context).map((line: string) => `  ${line}`),
    ...emitStatusResultDeclarations(context).map((line: string) => `  ${line}`),
    ...emitLoopFlowDeclarations(context).map((line: string) => `  ${line}`),
    ...emitReturnFlowDeclarations(context).map((line: string) => `  ${line}`),
    ...emitOwnedValueDeclarations(context).map((line: string) => `  ${line}`),
    ...emitOwnedPromiseDeclarations(context).map((line: string) => `  ${line}`),
    ...emitErrorChannelDeclarations(context).map((line: string) => `  ${line}`),
    ...emitBoxedValueDeclarations(context).map((line: string) => `  ${line}`),
    ...bodyLines
  ]

  if (shouldEmitCleanupLabel(context)) {
    lines.push('ccjs_cleanup:')
    lines.push(...emitOwnedValueCleanup(context).map((line: string) => `  ${line}`))
    lines.push(...emitOwnedPromiseCleanup(context).map((line: string) => `  ${line}`))
    lines.push(...emitBoxedValueCleanup(context).map((line: string) => `  ${line}`))
    lines.push(...emitCleanupReturn(context).map((line: string) => `  ${line}`))
  } else if (context.returnType !== 'void') {
    lines.push(`  return ${context.returnType === 'string' ? 'ccjs_undefined_value()' : '0'};`)
  }

  lines.push('}')

  return lines
}

export function emitClassMethodHead(info: CClassInfo, method: CNode, context: CEmitContext): string {
  const params = [
    'ccjs_value this',
    ...method.params.map((param: CFunctionParam, index: number) => emitClassMethodParam(param, index, method, context))
  ]

  return `static ${emitCReturnType(method.returnType, method.returnNullable)} ${emitCClassMethodName(info.name, method.name)}(${params.join(', ')})`
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

  if (isBoxedFunctionParam(param, index, method, context) && ['number', 'boolean'].includes(param.valueType)) {
    return `${emitCType(param.valueType)} ${emitCScalarParamName(param.name)}`
  }

  return `${emitCType(param.valueType)} ${param.name}`
}

function resolveCFunctionReturnInfo(
  statement: CNode,
  context: CEmitContext
): { returnType: string; returnNullable: boolean } {
  const returnType = resolveFunctionReturnType(statement.name, statement.returnType, context)
  const returnNullable = resolveFunctionReturnNullable(statement.name, statement.returnNullable, context)

  if (context.functionAsyncFlags.get(statement.name) === true && returnType === 'promise') {
    return {
      returnType:
        context.functionReturnPromiseValueTypes.get(statement.name) ?? statement.returnPromiseValueType ?? 'void',
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
      loc ?? undefined
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
  const lines = [context.processRuntime ? 'int main(int argc, char** argv) {' : 'int main(void) {']

  bodyLines.push(...deps.emitStatementList(body, context).map((line: string) => `  ${line}`))

  if (context.processRuntime) {
    lines.push('  ccjs_process_init(argc, argv);')
  }
  lines.push(...emitLoopFlowDeclarations(context).map((line: string) => `  ${line}`))
  lines.push(...emitReturnValueDeclarations(context).map((line: string) => `  ${line}`))
  lines.push(...emitReturnFlowDeclarations(context).map((line: string) => `  ${line}`))
  lines.push(...emitEventLoopDeclarations(context).map((line: string) => `  ${line}`))
  lines.push(...emitOwnedValueDeclarations(context).map((line: string) => `  ${line}`))
  lines.push(...emitOwnedPromiseDeclarations(context).map((line: string) => `  ${line}`))
  lines.push(...emitErrorChannelDeclarations(context).map((line: string) => `  ${line}`))
  lines.push(...emitBoxedValueDeclarations(context).map((line: string) => `  ${line}`))
  lines.push(...emitEventLoopInit(context).map((line: string) => `  ${line}`))
  lines.push(...bodyLines)
  lines.push(...emitEventLoopDrain(context).map((line: string) => `  ${line}`))

  if (shouldEmitCleanupLabel(context)) {
    lines.push('ccjs_cleanup:')
    lines.push(...emitOwnedValueCleanup(context).map((line: string) => `  ${line}`))
    lines.push(...emitOwnedPromiseCleanup(context).map((line: string) => `  ${line}`))
    lines.push(...emitEventLoopCleanup(context).map((line: string) => `  ${line}`))
    lines.push(...emitBoxedValueCleanup(context).map((line: string) => `  ${line}`))
  }

  lines.push(`  return ${emitMainReturnExpression(context)};`)
  lines.push('}')

  return lines
}

export function emitMainReturnExpression(context: CFunctionContext): string {
  const successReturn = context.processRuntime
    ? 'ccjs_process_get_exit_code()'
    : context.returnType === 'number'
      ? '(int)ccjs_return'
      : '0'

  return context.unhandledRejectionFlag == null
    ? successReturn
    : `${context.unhandledRejectionFlag} == 0 ? ${successReturn} : 1`
}

function emitRuntimeParamPreludeForParams(statement: CNode, params: CFunctionParam[], context: CFunctionContext): string[] {
  return params.flatMap((param: CFunctionParam, index: number) => {
    if (isNullableScalarParam(param)) {
      const paramName = emitCScalarParamName(param.name)
      const expectedTag = cRuntimeValueTag(param.valueType)

      return [
        ...emitRuntimeNullableValueCheck(paramName, expectedTag, context),
        `ccjs_value ${param.name} = ${paramName};`
      ]
    }

    if (isBoxedFunctionParam(param, index, statement, context) && ['string', 'object'].includes(param.valueType)) {
      const paramName =
        param.valueType === 'string' ? emitCStringParamName(param.name) : emitCObjectParamName(param.name)
      const tag = param.valueType === 'string' ? 'CCJS_TAG_STRING' : 'CCJS_TAG_OBJECT'

      return [
        emitRuntimeTypeCheck(`${paramName}.tag != ${tag} || ${paramName}.as.ref == 0`, context),
        `${param.name} = ccjs_default_alloc(0, sizeof(ccjs_value), _Alignof(ccjs_value));`,
        `if (${param.name} == 0) ${emitFailureStatement(context)}`,
        `*${param.name} = ${paramName};`,
        `ccjs_retain(*${param.name});`
      ]
    }

    if (param.valueType === 'string') {
      const paramName = emitCStringParamName(param.name)

      return [
        emitRuntimeTypeCheck(`${paramName}.tag != CCJS_TAG_STRING || ${paramName}.as.ref == 0`, context),
        `ccjs_string* ${param.name} = (ccjs_string*)${paramName}.as.ref;`
      ]
    }

    if (param.valueType === 'object') {
      return param.nullable === true
        ? emitRuntimeNullableValueCheck(param.name, 'CCJS_TAG_OBJECT', context)
        : [emitRuntimeTypeCheck(`${param.name}.tag != CCJS_TAG_OBJECT || ${param.name}.as.ref == 0`, context)]
    }

    if (param.valueType === 'array' || param.valueType === 'map' || param.valueType === 'set') {
      const tag = cRuntimeValueTag(param.valueType)

      return param.nullable === true
        ? emitRuntimeNullableValueCheck(param.name, tag, context)
        : [emitRuntimeTypeCheck(`${param.name}.tag != ${tag} || ${param.name}.as.ref == 0`, context)]
    }

    if (
      param.valueType === 'function' &&
      resolveFunctionParameterRuntimeType(statement.name, index, param, context) != null
    ) {
      if (param.nullable === true) {
        return emitRuntimeNullableValueCheck(param.name, 'CCJS_TAG_FUNCTION', context)
      }

      return [emitRuntimeTypeCheck(`${param.name}.tag != CCJS_TAG_FUNCTION || ${param.name}.as.ref == 0`, context)]
    }

    if (isBoxedFunctionParam(param, index, statement, context) && ['number', 'boolean'].includes(param.valueType)) {
      return [
        `${param.name} = ccjs_default_alloc(0, sizeof(double), _Alignof(double));`,
        `if (${param.name} == 0) ${emitFailureStatement(context)}`,
        `*${param.name} = ${emitCScalarParamName(param.name)};`
      ]
    }

    return []
  })
}

function emitThrowingFunctionPrelude(context: CFunctionContext): string[] {
  if (!context.throwingFunction) {
    return []
  }

  return [
    `if (${context.functionErrorOut} == 0${context.returnType === 'void' ? '' : ` || ${context.functionReturnOut} == 0`}) return CCJS_ERR_TYPE;`,
    `*${context.functionErrorOut} = ccjs_undefined_value();`,
    ...(context.returnType === 'void'
      ? []
      : [`*${context.functionReturnOut} = ${isThrowingFunctionRuntimeOut(context) ? 'ccjs_undefined_value()' : '0'};`])
  ]
}
