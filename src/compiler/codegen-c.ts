import { CompileError, diagnostic } from './diagnostics.ts'
import { hasIrFeature, lowerHirToIr } from './ir.ts'
import type { AnyNode, Diagnostic, IrProgram, ModuleGraph, ProgramNode } from './types.ts'

const cJsGlobalRoots = new Set([
  'Array',
  'Buffer',
  'Date',
  'Error',
  'Int8Array',
  'Int16Array',
  'Int32Array',
  'JSON',
  'Map',
  'Math',
  'Promise',
  'Set',
  'Uint8Array',
  'Uint16Array',
  'Uint32Array',
  'fetch',
  'fs',
  'http',
  'performance',
  'clearTimeout',
  'clearInterval',
  'clearImmediate',
  'setTimeout',
  'setInterval',
  'setImmediate'
])

const cStringPredicateMethods = new Set([
  'includes',
  'startsWith',
  'endsWith'
])

const cArrayMethods = new Set([
  'sort',
  'filter',
  'map'
])

export function emitC(program: ProgramNode, ir: IrProgram = lowerHirToIr(program)): string {
  return emitCUnit([program], program, [ir])
}

export function emitCBundle(graph: ModuleGraph): string {
  const entryModule = graph.modules.find(module => module.path === graph.entry)
  const programs = graph.modules.map(module => module.hir).filter((program): program is ProgramNode => program != null)
  const irPrograms = graph.modules.flatMap(module => module.hir == null ? [] : [module.ir ?? lowerHirToIr(module.hir)])

  return emitCUnit(programs, entryModule?.hir ?? graph.modules.at(-1)?.hir ?? null, irPrograms)
}

function emitCUnit(programs: ProgramNode[], entryProgram: ProgramNode | null, irPrograms: IrProgram[] = programs.map(program => lowerHirToIr(program))) {
  const diagnostics: Diagnostic[] = []
  const functions = collectFunctions(programs)
  const baseContext = createBaseContext(diagnostics, functions)
  baseContext.callbackWrappers = collectCallbackWrappers(programs, baseContext)
  const needsCallbackRuntime = [...baseContext.callbackWrappers.values()].some(isRuntimeCallbackWrapper) || irPrograms.some(program => hasIrFeature(program, 'callback-values')) || programs.some(usesCCallbackRuntime)
  const needsRuntime = baseContext.throwingFunctions.size > 0 || needsCallbackRuntime || irPrograms.some(program => hasIrFeature(program, 'runtime-values')) || programs.some(usesCRuntime)
  const needsTimeRuntime = irPrograms.some(program => hasIrFeature(program, 'clocks')) || programs.some(usesCTimeRuntime)
  const needsStringHeader = irPrograms.some(program => hasIrFeature(program, 'string-bytes')) || programs.some(usesCStringHeader)
  reportUnsupportedClasses(programs, diagnostics)
  reportUnsupportedAsync(programs, diagnostics)
  const lines = emitCPrelude(needsRuntime, needsTimeRuntime, needsCallbackRuntime, needsStringHeader)
  const arrowCallbackWrappers = [...baseContext.callbackWrappers.values()].filter(isRuntimeArrowCallbackWrapperWithContext)

  for (const wrapper of arrowCallbackWrappers) {
    lines.push(...emitRuntimeArrowCallbackContextType(wrapper))
    lines.push('')
  }

  for (const item of functions) {
    lines.push(`${emitFunctionHead(item, baseContext)};`)
  }

  for (const wrapper of baseContext.callbackWrappers.values()) {
    if (wrapper.kind === 'plain-arrow') {
      lines.push(`${emitPlainArrowCallbackWrapperHead(wrapper)};`)
      continue
    }

    if (isRuntimeArrowCallbackWrapperWithContext(wrapper)) {
      lines.push(`static void ${wrapper.finalizerName}(void* context);`)
    }

    lines.push(`${emitRuntimeCallbackWrapperHead(wrapper)};`)
  }

  if (functions.length > 0 || baseContext.callbackWrappers.size > 0) {
    lines.push('')
  }

  for (const wrapper of baseContext.callbackWrappers.values()) {
    lines.push(...(wrapper.kind === 'plain-arrow'
      ? emitPlainArrowCallbackWrapperDeclaration(wrapper, baseContext)
      : emitRuntimeCallbackWrapperDeclaration(wrapper, baseContext)))
    lines.push('')
  }

  for (const item of functions) {
    lines.push(...emitFunctionDeclaration(item, baseContext))
    lines.push('')
  }

  lines.push(...emitMainWrapper(entryProgram, baseContext))

  if (diagnostics.length > 0) {
    throw new CompileError(diagnostics)
  }

  return `${lines.join('\n')}\n`
}

function emitCPrelude(needsRuntime, needsTimeRuntime, needsCallbackRuntime, needsStringHeader) {
  const lines = [
    '#include <stdio.h>'
  ]

  if (needsStringHeader) {
    lines.push('#include <string.h>')
  }

  if (needsRuntime) {
    lines.push('#include <stdlib.h>')
    lines.push('#include "ccjs/array.h"')
    if (needsCallbackRuntime) {
      lines.push('#include "ccjs/callback.h"')
    }
    lines.push('#include "ccjs/map.h"')
    lines.push('#include "ccjs/object.h"')
    lines.push('#include "ccjs/set.h"')
    lines.push('#include "ccjs/string.h"')
  }

  if (needsTimeRuntime) {
    lines.push('#include "ccjs/time.h"')
  }

  lines.push('')

  if (needsRuntime) {
    lines.push('static void* ccjs_default_alloc(void* user, size_t size, size_t align) {')
    lines.push('  (void)user;')
    lines.push('  (void)align;')
    lines.push('  return calloc(1, size);')
    lines.push('}')
    lines.push('')
    lines.push('static void* ccjs_default_realloc(void* user, void* ptr, size_t old_size, size_t new_size, size_t align) {')
    lines.push('  (void)user;')
    lines.push('  (void)old_size;')
    lines.push('  (void)align;')
    lines.push('  return realloc(ptr, new_size);')
    lines.push('}')
    lines.push('')
    lines.push('static void ccjs_default_free(void* user, void* ptr, size_t size, size_t align) {')
    lines.push('  (void)user;')
    lines.push('  (void)size;')
    lines.push('  (void)align;')
    lines.push('  free(ptr);')
    lines.push('}')
    lines.push('')
    lines.push('static ccjs_allocator ccjs_default_allocator = {')
    lines.push('  0,')
    lines.push('  ccjs_default_alloc,')
    lines.push('  ccjs_default_realloc,')
    lines.push('  ccjs_default_free')
    lines.push('};')
    lines.push('')
  }

  return lines
}

function collectFunctions(programs) {
  return programs.flatMap(program => program.body.filter(item => item.type === 'FunctionDeclaration'))
}

function collectThrowingFunctionInfo(functions) {
  const functionNames = new Set(functions.map(item => item.name))
  const functionThrowValueTypes = new Map(functions.map(item => [item.name, []]))
  let changed = true

  while (changed) {
    changed = false

    for (const item of functions) {
      const types = uniqueThrowValueTypes(collectEscapingThrowValueTypesFromStatements(item.body, functionThrowValueTypes, functionNames, new Set(), false))
      const previous = functionThrowValueTypes.get(item.name) ?? []

      if (!sameThrowValueTypes(previous, types)) {
        functionThrowValueTypes.set(item.name, types)
        changed = true
      }
    }
  }

  const throwingFunctions = new Set()

  for (const [name, types] of functionThrowValueTypes.entries()) {
    if (name !== 'main' && Array.isArray(types) && types.length > 0) {
      throwingFunctions.add(name)
    }
  }

  return {
    functionThrowValueTypes,
    throwingFunctions
  }
}

function collectEscapingThrowValueTypesFromStatements(statements, functionThrowValueTypes, functionNames, errorObjectNames, hasErrorTarget) {
  return statements.flatMap(statement => collectEscapingThrowValueTypesFromStatement(statement, functionThrowValueTypes, functionNames, errorObjectNames, hasErrorTarget))
}

function collectEscapingThrowValueTypesFromStatement(statement, functionThrowValueTypes, functionNames, errorObjectNames, hasErrorTarget) {
  if (statement == null) {
    return []
  }

  if (statement.type === 'ThrowStatement') {
    return hasErrorTarget ? [] : [inferThrowValueTypeForAnalysis(statement.argument, errorObjectNames)]
  }

  if (statement.type === 'VariableDeclaration') {
    const types = collectEscapingThrowValueTypesFromExpression(statement.init, functionThrowValueTypes, functionNames, errorObjectNames, hasErrorTarget)

    if (isErrorValueExpressionForAnalysis(statement.init, errorObjectNames)) {
      errorObjectNames.add(statement.name)
    }

    return types
  }

  if (statement.type === 'ExpressionStatement') {
    return collectEscapingThrowValueTypesFromExpression(statement.expression, functionThrowValueTypes, functionNames, errorObjectNames, hasErrorTarget)
  }

  if (statement.type === 'ReturnStatement') {
    return collectEscapingThrowValueTypesFromExpression(statement.argument, functionThrowValueTypes, functionNames, errorObjectNames, hasErrorTarget)
  }

  if (statement.type === 'BlockStatement') {
    return collectEscapingThrowValueTypesFromStatements(statement.body, functionThrowValueTypes, functionNames, new Set(errorObjectNames), hasErrorTarget)
  }

  if (statement.type === 'IfStatement') {
    return [
      ...collectEscapingThrowValueTypesFromExpression(statement.condition, functionThrowValueTypes, functionNames, errorObjectNames, hasErrorTarget),
      ...collectEscapingThrowValueTypesFromStatement(statement.consequent, functionThrowValueTypes, functionNames, new Set(errorObjectNames), hasErrorTarget),
      ...collectEscapingThrowValueTypesFromStatement(statement.alternate, functionThrowValueTypes, functionNames, new Set(errorObjectNames), hasErrorTarget)
    ]
  }

  if (statement.type === 'WhileStatement') {
    return [
      ...collectEscapingThrowValueTypesFromExpression(statement.condition, functionThrowValueTypes, functionNames, errorObjectNames, hasErrorTarget),
      ...collectEscapingThrowValueTypesFromStatement(statement.body, functionThrowValueTypes, functionNames, new Set(errorObjectNames), hasErrorTarget)
    ]
  }

  if (statement.type === 'ForStatement') {
    return [
      ...(statement.init?.type === 'VariableDeclaration'
        ? collectEscapingThrowValueTypesFromStatement(statement.init, functionThrowValueTypes, functionNames, new Set(errorObjectNames), hasErrorTarget)
        : collectEscapingThrowValueTypesFromExpression(statement.init, functionThrowValueTypes, functionNames, errorObjectNames, hasErrorTarget)),
      ...collectEscapingThrowValueTypesFromExpression(statement.test, functionThrowValueTypes, functionNames, errorObjectNames, hasErrorTarget),
      ...collectEscapingThrowValueTypesFromExpression(statement.update, functionThrowValueTypes, functionNames, errorObjectNames, hasErrorTarget),
      ...collectEscapingThrowValueTypesFromStatement(statement.body, functionThrowValueTypes, functionNames, new Set(errorObjectNames), hasErrorTarget)
    ]
  }

  if (statement.type === 'ForOfStatement') {
    return [
      ...collectEscapingThrowValueTypesFromExpression(statement.iterable, functionThrowValueTypes, functionNames, errorObjectNames, hasErrorTarget),
      ...collectEscapingThrowValueTypesFromStatement(statement.body, functionThrowValueTypes, functionNames, new Set(errorObjectNames), hasErrorTarget)
    ]
  }

  if (statement.type === 'SwitchStatement') {
    return [
      ...collectEscapingThrowValueTypesFromExpression(statement.discriminant, functionThrowValueTypes, functionNames, errorObjectNames, hasErrorTarget),
      ...statement.cases.flatMap(item => [
        ...collectEscapingThrowValueTypesFromExpression(item.test, functionThrowValueTypes, functionNames, errorObjectNames, hasErrorTarget),
        ...collectEscapingThrowValueTypesFromStatements(item.consequent, functionThrowValueTypes, functionNames, new Set(errorObjectNames), hasErrorTarget)
      ])
    ]
  }

  if (statement.type === 'TryStatement') {
    const blockHasTarget = statement.handler != null ? true : hasErrorTarget

    return [
      ...collectEscapingThrowValueTypesFromStatement(statement.block, functionThrowValueTypes, functionNames, new Set(errorObjectNames), blockHasTarget),
      ...collectEscapingThrowValueTypesFromStatement(statement.handler?.body, functionThrowValueTypes, functionNames, new Set(errorObjectNames), hasErrorTarget),
      ...collectEscapingThrowValueTypesFromStatement(statement.finalizer, functionThrowValueTypes, functionNames, new Set(errorObjectNames), hasErrorTarget)
    ]
  }

  return []
}

function collectEscapingThrowValueTypesFromExpression(expression, functionThrowValueTypes, functionNames, errorObjectNames, hasErrorTarget) {
  if (expression == null) {
    return []
  }

  if (expression.type === 'CallExpression') {
    const callTypes = !hasErrorTarget && expression.callee.type === 'Reference' && expression.callee.path.length === 1 && functionNames.has(expression.callee.path[0])
      ? functionThrowValueTypes.get(expression.callee.path[0]) ?? []
      : []

    return [
      ...callTypes,
      ...collectEscapingThrowValueTypesFromExpression(expression.callee, functionThrowValueTypes, functionNames, errorObjectNames, hasErrorTarget),
      ...expression.args.flatMap(arg => collectEscapingThrowValueTypesFromExpression(arg, functionThrowValueTypes, functionNames, errorObjectNames, hasErrorTarget))
    ]
  }

  if (expression.type === 'NewExpression' || expression.type === 'OptionalCallExpression') {
    return [
      ...collectEscapingThrowValueTypesFromExpression(expression.callee, functionThrowValueTypes, functionNames, errorObjectNames, hasErrorTarget),
      ...expression.args.flatMap(arg => collectEscapingThrowValueTypesFromExpression(arg, functionThrowValueTypes, functionNames, errorObjectNames, hasErrorTarget))
    ]
  }

  if (expression.type === 'MemberExpression' || expression.type === 'OptionalMemberExpression') {
    return collectEscapingThrowValueTypesFromExpression(expression.object, functionThrowValueTypes, functionNames, errorObjectNames, hasErrorTarget)
  }

  if (expression.type === 'IndexExpression' || expression.type === 'OptionalIndexExpression') {
    return [
      ...collectEscapingThrowValueTypesFromExpression(expression.object, functionThrowValueTypes, functionNames, errorObjectNames, hasErrorTarget),
      ...collectEscapingThrowValueTypesFromExpression(expression.index, functionThrowValueTypes, functionNames, errorObjectNames, hasErrorTarget)
    ]
  }

  if (expression.type === 'AssignmentExpression') {
    return [
      ...collectEscapingThrowValueTypesFromExpression(expression.target, functionThrowValueTypes, functionNames, errorObjectNames, hasErrorTarget),
      ...collectEscapingThrowValueTypesFromExpression(expression.value, functionThrowValueTypes, functionNames, errorObjectNames, hasErrorTarget)
    ]
  }

  if (expression.type === 'BinaryExpression') {
    return [
      ...collectEscapingThrowValueTypesFromExpression(expression.left, functionThrowValueTypes, functionNames, errorObjectNames, hasErrorTarget),
      ...collectEscapingThrowValueTypesFromExpression(expression.right, functionThrowValueTypes, functionNames, errorObjectNames, hasErrorTarget)
    ]
  }

  if (expression.type === 'UnaryExpression' || expression.type === 'AwaitExpression') {
    return collectEscapingThrowValueTypesFromExpression(expression.argument, functionThrowValueTypes, functionNames, errorObjectNames, hasErrorTarget)
  }

  if (expression.type === 'ArrayLiteral') {
    return expression.elements.flatMap(item => collectEscapingThrowValueTypesFromExpression(item, functionThrowValueTypes, functionNames, errorObjectNames, hasErrorTarget))
  }

  if (expression.type === 'ObjectLiteral') {
    return expression.properties.flatMap(property => collectEscapingThrowValueTypesFromExpression(property.value, functionThrowValueTypes, functionNames, errorObjectNames, hasErrorTarget))
  }

  return []
}

function inferThrowValueTypeForAnalysis(expression, errorObjectNames) {
  if (isErrorValueExpressionForAnalysis(expression, errorObjectNames)) {
    return 'error'
  }

  if (expression?.type === 'StringLiteral' || expression?.type === 'TemplateLiteral' || expression?.valueType === 'string') {
    return 'string'
  }

  return 'other'
}

function isErrorValueExpressionForAnalysis(expression, errorObjectNames) {
  if (isErrorConstructorExpression(expression)) {
    return true
  }

  return expression?.type === 'Reference' && expression.path.length === 1 && errorObjectNames.has(expression.path[0])
}

function uniqueThrowValueTypes(types) {
  return [...new Set(types)]
}

function sameThrowValueTypes(left, right) {
  return left.length === right.length && left.every(item => right.includes(item))
}

function reportUnsupportedClasses(programs, diagnostics) {
  for (const item of programs.flatMap(program => program.body)) {
    if (item.type === 'ClassDeclaration') {
      diagnostics.push(diagnostic('CCJS_C_CLASS', 'classes are not supported by the current C backend slice', item.loc))
    }
  }
}

function reportUnsupportedAsync(programs, diagnostics) {
  for (const item of programs.flatMap(program => program.body)) {
    if (item.type === 'FunctionDeclaration' && item.async) {
      diagnostics.push(diagnostic('CCJS_C_ASYNC', 'async/await is not supported by the current C backend slice', item.loc))
    }
  }
}

function createBaseContext(diagnostics, functions) {
  const throwing = collectThrowingFunctionInfo(functions)

  return {
    boxedMutableCaptureDeclarations: new Set(),
    callbackArrowWrappers: new Map(),
    callbackWrappers: new Map(),
    diagnostics,
    functionThrowValueTypes: throwing.functionThrowValueTypes,
    functionNames: new Map(functions.map(item => [item.name, emitCFunctionName(item.name)])),
    functionParams: new Map(functions.map(item => [item.name, item.params])),
    functionReturnNullables: new Map(functions.map(item => [item.name, item.returnNullable === true])),
    functionReturnTypes: new Map(functions.map(item => [item.name, item.returnType])),
    runtimeFunctionParams: new Map(),
    throwingFunctions: throwing.throwingFunctions,
    nextId: 0
  }
}

function emitFunctionDeclaration(statement, baseContext) {
  const context = createFunctionContext(baseContext, statement.returnType, statement.returnNullable === true)
  context.returnShape = statement.returnShape ?? null
  context.throwingFunction = isThrowingFunctionName(statement.name, context)
  context.functionReturnOut = 'ccjs_out'
  context.functionErrorOut = 'ccjs_error_out'

  if (context.throwingFunction) {
    registerErrorChannel(context)
  }

  for (const [index, param] of statement.params.entries()) {
    if (isNullableScalarParam(param)) {
      context.variables.set(param.name, param.valueType)
      context.nullableVariables.add(param.name)
    } else if (context.boxedMutableCaptureDeclarations.has(param) && ['number', 'boolean', 'string', 'object'].includes(param.valueType)) {
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
    } else if (param.valueType === 'function') {
      const runtimeFunctionType = resolveFunctionParameterRuntimeType(statement.name, index, param, context)

      context.variables.set(param.name, 'function')
      context.functionTypes.set(param.name, runtimeFunctionType ?? param.functionType)

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

  const bodyLines: string[] = []

  bodyLines.push(...emitRuntimeParamPrelude(statement, context).map(line => `  ${line}`))

  bodyLines.push(...emitStatementList(statement.body, context).map(line => `  ${line}`))

  const lines = [
    `${emitFunctionHead(statement, context)} {`,
    ...emitThrowingFunctionPrelude(context).map(line => `  ${line}`),
    ...emitReturnValueDeclarations(context).map(line => `  ${line}`),
    ...emitStatusResultDeclarations(context).map(line => `  ${line}`),
    ...emitLoopFlowDeclarations(context).map(line => `  ${line}`),
    ...emitReturnFlowDeclarations(context).map(line => `  ${line}`),
    ...emitOwnedValueDeclarations(context).map(line => `  ${line}`),
    ...emitErrorChannelDeclarations(context).map(line => `  ${line}`),
    ...emitBoxedValueDeclarations(context).map(line => `  ${line}`),
    ...bodyLines
  ]

  if (shouldEmitCleanupLabel(context)) {
    lines.push('ccjs_cleanup:')
    lines.push(...emitThrowingFunctionErrorTransfer(context).map(line => `  ${line}`))
    lines.push(...emitOwnedValueCleanup(context).map(line => `  ${line}`))
    lines.push(...emitBoxedValueCleanup(context).map(line => `  ${line}`))
    lines.push(...emitCleanupReturn(context).map(line => `  ${line}`))
  } else if (statement.returnType !== 'void') {
    lines.push(`  return ${statement.returnType === 'string' ? '""' : '0'};`)
  }

  lines.push('}')

  return lines
}

function emitFunctionHead(statement, context) {
  const name = context.functionNames.get(statement.name) ?? emitCFunctionName(statement.name)
  const params = statement.params.map((param, index) => {
    if (isNullableScalarParam(param)) {
      return `ccjs_value ${emitCScalarParamName(param.name)}`
    }

    if (param.valueType === 'string') {
      return `ccjs_value ${emitCStringParamName(param.name)}`
    }

    if (param.valueType === 'object') {
      if (context.boxedMutableCaptureDeclarations.has(param)) {
        return `ccjs_value ${emitCObjectParamName(param.name)}`
      }

      return `ccjs_value ${param.name}`
    }

    if (param.valueType === 'function') {
      if (resolveFunctionParameterRuntimeType(statement.name, index, param, context) != null) {
        return `ccjs_value ${param.name}`
      }

      return emitFunctionParameter(param.name, param.functionType, context, param.loc)
    }

    if (context.boxedMutableCaptureDeclarations.has(param) && ['number', 'boolean'].includes(param.valueType)) {
      return `${emitCType(param.valueType)} ${emitCScalarParamName(param.name)}`
    }

    return `${emitCType(param.valueType)} ${param.name}`
  })

  if (isThrowingFunctionName(statement.name, context)) {
    if (statement.returnType !== 'void') {
      params.push(`${emitThrowingFunctionOutType(statement.returnType, statement.returnNullable === true)}* ccjs_out`)
    }

    params.push('ccjs_value* ccjs_error_out')

    return `ccjs_status ${name}(${params.length === 0 ? 'void' : params.join(', ')})`
  }

  return `${emitCReturnType(statement.returnType, statement.returnNullable === true)} ${name}(${params.length === 0 ? 'void' : params.join(', ')})`
}

function emitFunctionParameter(name, functionType, context, loc) {
  reportUnsupportedCFunctionType(functionType, context, loc)

  if (isRuntimeFunctionType(functionType)) {
    return `ccjs_value ${name}`
  }

  return emitFunctionPointerParameter(name, functionType)
}

function emitFunctionPointerParameter(name, functionType) {
  return `${emitFunctionPointerReturnType(functionType)} (*${name})(${emitFunctionPointerParams(functionType)})`
}

function emitFunctionPointerVariable(name, init, context, isConst, functionType, loc) {
  reportUnsupportedCFunctionType(functionType, context, loc)

  return `${emitFunctionPointerReturnType(functionType)} (*${isConst ? 'const ' : ''}${name})(${emitFunctionPointerParams(functionType)}) = ${emitFunctionValueExpression(init, context)}`
}

function reportUnsupportedCFunctionType(functionType, context, loc) {
  if (functionType == null) {
    return
  }

  if (isPlainFunctionPointerType(functionType) || isRuntimeFunctionType(functionType)) {
    return
  }

  context.diagnostics.push(diagnostic('CCJS_C_FUNCTION_VALUE', 'typed C callbacks currently support only void callbacks with number/boolean/string/object parameters', loc))
}

const genericFunctionType = {
  kind: 'function',
  params: [],
  returnType: 'void'
}

function normalizeFunctionType(functionType) {
  return functionType ?? genericFunctionType
}

function isPlainFunctionPointerType(functionType) {
  return functionType == null
    || (functionType.returnType === 'void' && functionType.params.every(param => ['number', 'boolean'].includes(param.valueType)))
}

function isRuntimeFunctionType(functionType) {
  return functionType != null
    && isSupportedRuntimeCallbackReturnType(functionType.returnType)
    && functionType.params.some(param => ['string', 'object'].includes(param.valueType))
    && functionType.params.every(param => ['number', 'boolean', 'string', 'object'].includes(param.valueType))
}

function isNullableFunctionType(valueType, nullable) {
  return valueType === 'function' && nullable === true
}

function isSupportedRuntimeCallbackType(functionType) {
  const normalized = normalizeFunctionType(functionType)

  return isSupportedRuntimeCallbackReturnType(normalized.returnType)
    && normalized.params.every(param => ['number', 'boolean', 'string', 'object'].includes(param.valueType))
}

function isSupportedRuntimeCallbackReturnType(returnType) {
  return ['void', 'number', 'boolean', 'string', 'object'].includes(returnType)
}

function runtimeFunctionParamKey(functionName, index) {
  return `${functionName}:${index}`
}

function markRuntimeFunctionParam(callee, index, functionType, context) {
  if (callee?.type !== 'Reference' || callee.path.length !== 1) {
    return
  }

  const name = callee.path[0]

  if (!context.functionParams.has(name) || !isSupportedRuntimeCallbackType(functionType)) {
    return
  }

  context.runtimeFunctionParams.set(runtimeFunctionParamKey(name, index), normalizeFunctionType(functionType))
}

function resolveFunctionParameterRuntimeType(functionName, index, param, context) {
  const promoted = context.runtimeFunctionParams.get(runtimeFunctionParamKey(functionName, index))

  if (promoted != null) {
    return promoted
  }

  if (isNullableFunctionType(param.valueType, param.nullable)) {
    return normalizeFunctionType(param.functionType)
  }

  return isRuntimeFunctionType(param.functionType) ? normalizeFunctionType(param.functionType) : null
}

function resolveRuntimeFunctionArgumentType(callee, index, param, context) {
  if (param?.valueType !== 'function') {
    return null
  }

  if (callee?.type === 'Reference' && callee.path.length === 1) {
    const promoted = context.runtimeFunctionParams.get(runtimeFunctionParamKey(callee.path[0], index))

    if (promoted != null) {
      return promoted
    }
  }

  if (isNullableFunctionType(param.valueType, param.nullable)) {
    return normalizeFunctionType(param.functionType)
  }

  return isRuntimeFunctionType(param.functionType) ? normalizeFunctionType(param.functionType) : null
}

function collectCallbackWrappers(programs, context) {
  const wrappers = new Map()
  const pendingPlainFunctionArgs: any[] = []
  const register = (expression, functionType, scopes) => {
    if (isPlainFunctionPointerType(functionType) && expression?.type === 'ArrowFunctionExpression') {
      registerPlainArrow(expression, functionType, scopes)
      return
    }

    if (!isRuntimeFunctionType(functionType)) {
      return
    }

    if (expression?.type === 'ArrowFunctionExpression') {
      registerArrow(expression, functionType, scopes)
      return
    }

    registerNamed(expression, functionType)
  }
  const registerRuntime = (expression, functionType, scopes) => {
    const normalized = normalizeFunctionType(functionType)

    if (!isSupportedRuntimeCallbackType(normalized)) {
      return
    }

    if (expression?.type === 'ArrowFunctionExpression') {
      registerArrow(expression, normalized, scopes)
      return
    }

    registerNamed(expression, normalized)
  }
  const registerPlain = (expression, functionType, scopes) => {
    if (expression?.type === 'ArrowFunctionExpression') {
      registerPlainArrow(expression, functionType, scopes)
    }
  }
  const hasCaptures = (expression, scopes) => expression?.type === 'ArrowFunctionExpression'
    && collectArrowCaptures(expression, scopes, context).length > 0
  const shouldPromotePlainFunctionExpression = (expression, functionType, scopes) => isPlainFunctionPointerType(functionType)
    && isSupportedRuntimeCallbackType(functionType)
    && hasCaptures(expression, scopes)
  const registerNamed = (expression, functionType) => {
    if (expression?.type !== 'Reference' || expression.path.length !== 1) {
      return
    }

    const target = expression.path[0]

    if (!context.functionNames.has(target)) {
      return
    }

    const key = runtimeCallbackWrapperKey(target, functionType)

    if (wrappers.has(key)) {
      return
    }

    wrappers.set(key, {
      kind: 'named',
      key,
      name: `ccjs_callback_${emitCIdentifier(target)}_${wrappers.size}`,
      target,
      functionType
    })
  }
  const registerArrow = (expression, functionType, scopes) => {
    if (context.callbackArrowWrappers.has(expression)) {
      return
    }

    const index = wrappers.size
    const key = `arrow:${index}`
    const captures = collectArrowCaptures(expression, scopes, context)

    for (const capture of captures) {
      if (capture.mutable && ['number', 'boolean', 'string', 'object'].includes(capture.valueType) && capture.declaration != null) {
        context.boxedMutableCaptureDeclarations.add(capture.declaration)
      }
    }

    const wrapper = {
      kind: 'arrow',
      key,
      name: `ccjs_callback_arrow_${index}`,
      contextTypeName: `ccjs_callback_context_${index}`,
      finalizerName: `ccjs_callback_context_${index}_finalize`,
      expression,
      functionType,
      captures
    }

    wrappers.set(key, wrapper)
    context.callbackArrowWrappers.set(expression, wrapper)
  }
  const registerPlainArrow = (expression, functionType, scopes) => {
    if (context.callbackArrowWrappers.has(expression)) {
      return
    }

    const captures = collectArrowCaptures(expression, scopes, context)

    if (captures.length > 0) {
      return
    }

    const index = wrappers.size
    const key = `plain-arrow:${index}`
    const wrapper = {
      kind: 'plain-arrow',
      key,
      name: `ccjs_callback_arrow_${index}`,
      expression,
      functionType
    }

    wrappers.set(key, wrapper)
    context.callbackArrowWrappers.set(expression, wrapper)
  }
  const declare = (scope, name, info) => {
    scope.set(name, info)
  }
  const declareParams = (scope, params) => {
    for (const param of params) {
      declare(scope, param.name, {
        name: param.name,
        valueType: param.valueType,
        declaration: param,
        functionType: param.functionType,
        nullable: param.nullable === true,
        shape: param.shape,
        runtimeManaged: ['string', 'object'].includes(param.valueType),
        mutable: true
      })
    }
  }
  const declareVariable = (scope, statement, scopes) => {
    const valueType = statement.valueType === 'unknown'
      ? inferCapturedExpressionValueType(statement.init, scopes)
      : statement.valueType

    declare(scope, statement.name, {
      name: statement.name,
      valueType,
      functionType: statement.functionType,
      declaration: statement,
      nullable: statement.nullable === true,
      shape: statement.shape,
      runtimeCallback: isNullableFunctionType(valueType, statement.nullable) || isRuntimeFunctionType(statement.functionType) || shouldPromotePlainFunctionExpression(statement.init, statement.functionType, scopes),
      runtimeManaged: isRuntimeManagedCaptureBinding(statement, scopes, valueType),
      mutable: statement.kind === 'let'
    })
  }
  const lookup = (name, scopes) => {
    for (let index = scopes.length - 1; index >= 0; index -= 1) {
      const entry = scopes[index].get(name)

      if (entry != null) {
        return entry
      }
    }

    return null
  }
  const isRuntimeManagedCaptureBinding = (statement, scopes, valueType) => {
    if (valueType === 'object') {
      return true
    }

    if (valueType !== 'string') {
      return false
    }

    if (statement.init?.type === 'StringLiteral') {
      return false
    }

    if (statement.init?.type === 'TemplateLiteral' && !statement.init.raw.includes('${')) {
      return false
    }

    if (statement.init?.type === 'Reference' && statement.init.path.length === 1) {
      return lookup(statement.init.path[0], scopes)?.runtimeManaged === true
    }

    return true
  }
  const inferCapturedExpressionValueType = (expression, scopes) => {
    if (expression?.valueType != null && expression.valueType !== 'unknown') {
      return expression.valueType
    }

    if (expression?.type === 'Reference' && expression.path.length === 1) {
      return lookup(expression.path[0], scopes)?.valueType ?? 'unknown'
    }

    if (expression?.type === 'MemberExpression') {
      const object = inferCapturedExpressionInfo(expression.object, scopes)
      const field = object.shape?.fields?.find(field => field.name === expression.property)

      return field?.valueType ?? 'unknown'
    }

    if (expression?.type === 'IndexExpression' && expression.index.type === 'StringLiteral') {
      const object = inferCapturedExpressionInfo(expression.object, scopes)
      const field = object.shape?.fields?.find(field => field.name === expression.index.value)

      return field?.valueType ?? 'unknown'
    }

    return 'unknown'
  }
  const inferCapturedExpressionInfo = (expression, scopes) => {
    if (expression?.type === 'Reference' && expression.path.length === 1) {
      const entry = lookup(expression.path[0], scopes)

      if (entry != null) {
        return entry
      }
    }

    return {
      valueType: inferCapturedExpressionValueType(expression, scopes),
      shape: null
    }
  }
  const visitStatement = (statement, scopes) => {
    if (statement?.type === 'VariableDeclaration') {
      if (isNullableFunctionType(statement.valueType, statement.nullable)) {
        registerRuntime(statement.init, statement.functionType, scopes)
      } else if (shouldPromotePlainFunctionExpression(statement.init, statement.functionType, scopes)) {
        registerRuntime(statement.init, statement.functionType, scopes)
      } else {
        register(statement.init, statement.functionType, scopes)
      }

      visitExpression(statement.init, scopes)
      declareVariable(scopes.at(-1), statement, scopes)
      return
    }

    if (statement?.type === 'ExpressionStatement') {
      visitExpression(statement.expression, scopes)
      return
    }

    if (statement?.type === 'ReturnStatement') {
      visitExpression(statement.argument, scopes)
      return
    }

    if (statement?.type === 'ThrowStatement') {
      visitExpression(statement.argument, scopes)
      return
    }

    if (statement?.type === 'BlockStatement') {
      const scope = new Map()
      statement.body.forEach(item => visitStatement(item, [...scopes, scope]))
      return
    }

    if (statement?.type === 'IfStatement') {
      visitExpression(statement.condition, scopes)
      visitStatement(statement.consequent, scopes)
      visitStatement(statement.alternate, scopes)
      return
    }

    if (statement?.type === 'WhileStatement') {
      visitExpression(statement.condition, scopes)
      visitStatement(statement.body, scopes)
      return
    }

    if (statement?.type === 'ForStatement') {
      const scope = new Map()
      const loopScopes = [...scopes, scope]

      if (statement.init?.type === 'VariableDeclaration') {
        visitStatement(statement.init, loopScopes)
      } else {
        visitExpression(statement.init, loopScopes)
      }

      visitExpression(statement.test, loopScopes)
      visitExpression(statement.update, loopScopes)
      visitStatement(statement.body, loopScopes)
      return
    }

    if (statement?.type === 'ForOfStatement') {
      visitExpression(statement.iterable, scopes)
      const scope = new Map()
      declare(scope, statement.name, {
        name: statement.name,
        valueType: 'unknown',
        mutable: statement.kind === 'let'
      })
      visitStatement(statement.body, [...scopes, scope])
      return
    }

    if (statement?.type === 'SwitchStatement') {
      visitExpression(statement.discriminant, scopes)

      for (const item of statement.cases) {
        visitExpression(item.test, scopes)
        const scope = new Map()
        item.consequent.forEach(statement => visitStatement(statement, [...scopes, scope]))
      }
    }

    if (statement?.type === 'TryStatement') {
      visitStatement(statement.block, scopes)
      visitStatement(statement.handler?.body, scopes)
      visitStatement(statement.finalizer, scopes)
    }
  }
  const visitExpression = (expression, scopes) => {
    if (expression == null) {
      return
    }

    if (expression.type === 'CallExpression') {
      const params = resolveStaticFunctionParams(expression.callee, context)

      for (const [index, arg] of expression.args.entries()) {
        const param = params?.[index]

        if (param?.valueType === 'function') {
          if (isNullableFunctionType(param.valueType, param.nullable)) {
            registerRuntime(arg, param.functionType, scopes)
          } else if (isRuntimeFunctionType(param.functionType)) {
            registerRuntime(arg, param.functionType, scopes)
          } else {
            pendingPlainFunctionArgs.push({
              callee: expression.callee,
              index,
              arg,
              functionType: normalizeFunctionType(param.functionType),
              scopes
            })

              const argInfo = arg.type === 'Reference' && arg.path.length === 1
                ? lookup(arg.path[0], scopes)
                : null

              if (hasCaptures(arg, scopes) || argInfo?.runtimeCallback === true) {
                markRuntimeFunctionParam(expression.callee, index, param.functionType, context)
              }
            }
        }

        visitExpression(arg, scopes)
      }

      visitExpression(expression.callee, scopes)
      return
    }

    if (expression.type === 'AssignmentExpression') {
      const targetInfo = expression.target?.type === 'Reference' && expression.target.path.length === 1
        ? lookup(expression.target.path[0], scopes)
        : null

      if (isNullableFunctionType(targetInfo?.valueType, targetInfo?.nullable)) {
        registerRuntime(expression.value, targetInfo.functionType, scopes)
      }

      visitExpression(expression.target, scopes)
      visitExpression(expression.value, scopes)
      return
    }

    if (expression.type === 'BinaryExpression') {
      visitExpression(expression.left, scopes)
      visitExpression(expression.right, scopes)
      return
    }

    if (expression.type === 'UnaryExpression' || expression.type === 'AwaitExpression') {
      visitExpression(expression.argument, scopes)
      return
    }

    if (expression.type === 'MemberExpression' || expression.type === 'OptionalMemberExpression') {
      visitExpression(expression.object, scopes)
      return
    }

    if (expression.type === 'IndexExpression' || expression.type === 'OptionalIndexExpression') {
      visitExpression(expression.object, scopes)
      visitExpression(expression.index, scopes)
      return
    }

    if (expression.type === 'OptionalCallExpression' || expression.type === 'NewExpression') {
      visitExpression(expression.callee, scopes)
      expression.args.forEach(arg => visitExpression(arg, scopes))
      return
    }

    if (expression.type === 'ArrayLiteral') {
      expression.elements.forEach(element => visitExpression(element, scopes))
      return
    }

    if (expression.type === 'ObjectLiteral') {
      expression.properties.forEach(property => visitExpression(property.value, scopes))
      return
    }

    if (expression.type === 'ArrowFunctionExpression') {
      return
    }
  }

  for (const program of programs) {
    const topLevelScope = new Map()

    for (const item of program.body) {
      if (item.type === 'FunctionDeclaration') {
        const scope = new Map()
        declareParams(scope, item.params)
        item.body.forEach(statement => visitStatement(statement, [topLevelScope, scope]))
      } else {
        visitStatement(item, [topLevelScope])
      }
    }
  }

  for (const pending of pendingPlainFunctionArgs) {
    if (resolveRuntimeFunctionArgumentType(pending.callee, pending.index, {
      valueType: 'function',
      functionType: pending.functionType
    }, context) != null) {
      registerRuntime(pending.arg, pending.functionType, pending.scopes)
    } else {
      registerPlain(pending.arg, pending.functionType, pending.scopes)
    }
  }

  return wrappers
}

function collectArrowCaptures(expression, outerScopes, context) {
  const captures = new Map()
  const localScope = new Map()
  const localScopes = [localScope]

  for (const param of expression.params) {
    localScope.set(param.name, {
      name: param.name,
      valueType: param.valueType,
      mutable: true
    })
  }

  const lookup = (name, scopes) => {
    for (let index = scopes.length - 1; index >= 0; index -= 1) {
      const entry = scopes[index].get(name)

      if (entry != null) {
        return entry
      }
    }

    return null
  }
  const addReference = reference => {
    if (reference.path.length !== 1) {
      return
    }

    const name = reference.path[0]

    if (lookup(name, localScopes) != null || context.functionNames.has(name) || isCJsGlobalRoot(name)) {
      return
    }

    const outer = lookup(name, outerScopes)

    if (outer != null && !captures.has(name)) {
      captures.set(name, {
        ...outer,
        name
      })
    }
  }
  const declareLocal = statement => {
    localScopes[localScopes.length - 1].set(statement.name, {
      name: statement.name,
      valueType: statement.valueType,
      functionType: statement.functionType,
      shape: statement.shape,
      mutable: statement.kind === 'let'
    })
  }
  const visitStatement = statement => {
    if (statement == null) {
      return
    }

    if (statement.type === 'VariableDeclaration') {
      visitExpression(statement.init)
      declareLocal(statement)
      return
    }

    if (statement.type === 'ExpressionStatement') {
      visitExpression(statement.expression)
      return
    }

    if (statement.type === 'ReturnStatement' || statement.type === 'ThrowStatement') {
      visitExpression(statement.argument)
      return
    }

    if (statement.type === 'BlockStatement') {
      localScopes.push(new Map())
      statement.body.forEach(visitStatement)
      localScopes.pop()
      return
    }

    if (statement.type === 'IfStatement') {
      visitExpression(statement.condition)
      visitStatement(statement.consequent)
      visitStatement(statement.alternate)
      return
    }

    if (statement.type === 'WhileStatement') {
      visitExpression(statement.condition)
      visitStatement(statement.body)
      return
    }

    if (statement.type === 'ForStatement') {
      localScopes.push(new Map())

      if (statement.init?.type === 'VariableDeclaration') {
        visitStatement(statement.init)
      } else {
        visitExpression(statement.init)
      }

      visitExpression(statement.test)
      visitExpression(statement.update)
      visitStatement(statement.body)
      localScopes.pop()
      return
    }

    if (statement.type === 'ForOfStatement') {
      visitExpression(statement.iterable)
      localScopes.push(new Map([[statement.name, {
        name: statement.name,
        valueType: 'unknown',
        mutable: statement.kind === 'let'
      }]]))
      visitStatement(statement.body)
      localScopes.pop()
      return
    }

    if (statement.type === 'SwitchStatement') {
      visitExpression(statement.discriminant)

      for (const item of statement.cases) {
        visitExpression(item.test)
        localScopes.push(new Map())
        item.consequent.forEach(visitStatement)
        localScopes.pop()
      }
    }

    if (statement.type === 'TryStatement') {
      visitStatement(statement.block)

      if (statement.handler != null) {
        const catchScope = new Map()

        if (statement.handler.param != null) {
          catchScope.set(statement.handler.param, {
            name: statement.handler.param,
            valueType: 'string',
            mutable: true
          })
        }

        localScopes.push(catchScope)
        visitStatement(statement.handler.body)
        localScopes.pop()
      }

      visitStatement(statement.finalizer)
    }
  }
  const visitExpression = node => {
    if (node == null) {
      return
    }

    if (node.type === 'Reference') {
      addReference(node)
      return
    }

    if (node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') {
      visitExpression(node.object)
      return
    }

    if (node.type === 'IndexExpression' || node.type === 'OptionalIndexExpression') {
      visitExpression(node.object)
      visitExpression(node.index)
      return
    }

    if (node.type === 'CallExpression' || node.type === 'OptionalCallExpression' || node.type === 'NewExpression') {
      visitExpression(node.callee)
      node.args.forEach(visitExpression)
      return
    }

    if (node.type === 'AssignmentExpression') {
      visitExpression(node.target)
      visitExpression(node.value)
      return
    }

    if (node.type === 'BinaryExpression') {
      visitExpression(node.left)
      visitExpression(node.right)
      return
    }

    if (node.type === 'UnaryExpression' || node.type === 'AwaitExpression') {
      visitExpression(node.argument)
      return
    }

    if (node.type === 'ArrayLiteral') {
      node.elements.forEach(visitExpression)
      return
    }

    if (node.type === 'ObjectLiteral') {
      node.properties.forEach(property => visitExpression(property.value))
    }
  }

  if (expression.expressionBody) {
    visitExpression(expression.body)
  } else {
    expression.body.forEach(visitStatement)
  }

  return [...captures.values()]
}

function resolveStaticFunctionParams(callee, context) {
  if (callee?.type !== 'Reference' || callee.path.length !== 1) {
    return null
  }

  return context.functionParams.get(callee.path[0]) ?? null
}

function runtimeCallbackWrapperKey(target, functionType) {
  return `${target}:${functionType.returnType}(${functionType.params.map(param => param.valueType).join(',')})`
}

function runtimeCallbackWrapperFor(target, functionType, context) {
  return context.callbackWrappers.get(runtimeCallbackWrapperKey(target, functionType)) ?? null
}

function emitRuntimeCallbackWrapperHead(wrapper) {
  return `static ccjs_status ${wrapper.name}(void* context, const ccjs_value* args, size_t arg_count, ccjs_value* out)`
}

function isRuntimeCallbackWrapper(wrapper) {
  return wrapper.kind !== 'plain-arrow'
}

function emitPlainArrowCallbackWrapperHead(wrapper) {
  return `static ${emitFunctionPointerReturnType(wrapper.functionType)} ${wrapper.name}(${emitPlainArrowCallbackParams(wrapper)})`
}

function emitPlainArrowCallbackParams(wrapper) {
  const params = wrapper.functionType?.params ?? []

  if (params.length === 0) {
    return 'void'
  }

  return params.map((param, index) => `${emitCType(param.valueType)} ${plainArrowCallbackParamName(wrapper, index)}`).join(', ')
}

function emitPlainArrowCallbackWrapperDeclaration(wrapper, baseContext) {
  const context = createFunctionContext(baseContext, wrapper.functionType?.returnType ?? 'void')
  context.cleanupEnabled = false

  for (const [index, param] of (wrapper.functionType?.params ?? []).entries()) {
    context.variables.set(plainArrowCallbackParamName(wrapper, index), param.valueType)
  }

  const statements = wrapper.expression.expressionBody
    ? [{
        type: 'ExpressionStatement',
        expression: wrapper.expression.body
      }]
    : wrapper.expression.body
  const statementLines = emitStatementList(statements, context)
  const lines = [
    `${emitPlainArrowCallbackWrapperHead(wrapper)} {`,
    ...emitOwnedValueDeclarations(context).map(line => `  ${line}`),
    ...emitBoxedValueDeclarations(context).map(line => `  ${line}`),
    ...statementLines.map(line => `  ${line}`)
  ]

  if (shouldEmitCleanupLabel(context)) {
    lines.push('ccjs_cleanup:')
    lines.push(...emitOwnedValueCleanup(context).map(line => `  ${line}`))
    lines.push(...emitBoxedValueCleanup(context).map(line => `  ${line}`))
    lines.push(`  ${emitCleanupReturn(context)}`)
  }

  lines.push('}')

  return lines
}

function plainArrowCallbackParamName(wrapper, index) {
  return wrapper.expression.params[index]?.name ?? `ccjs_arg_${index}`
}

function emitRuntimeCallbackWrapperDeclaration(wrapper, context) {
  if (wrapper.kind === 'arrow') {
    return emitRuntimeArrowCallbackWrapperDeclaration(wrapper, context)
  }

  const lines = [
    `${emitRuntimeCallbackWrapperHead(wrapper)} {`,
    '  (void)context;',
    `  if (out == 0 || arg_count != ${wrapper.functionType.params.length}${wrapper.functionType.params.length === 0 ? '' : ' || args == 0'}) return CCJS_ERR_TYPE;`,
    '  *out = ccjs_undefined_value();'
  ]
  const args: string[] = []

  for (const [index, param] of wrapper.functionType.params.entries()) {
    lines.push(...emitRuntimeCallbackWrapperArgChecks(param, index).map(line => `  ${line}`))
    args.push(emitRuntimeCallbackWrapperArg(param, index))
  }

  const call = `${context.functionNames.get(wrapper.target) ?? emitCFunctionName(wrapper.target)}(${args.join(', ')})`

  if (wrapper.functionType.returnType === 'number') {
    lines.push(`  *out = ccjs_number_value(${call});`)
  } else if (wrapper.functionType.returnType === 'boolean') {
    lines.push(`  *out = ccjs_bool_value((${call}) != 0);`)
  } else if (isManagedRuntimeReturnType(wrapper.functionType.returnType)) {
    lines.push(`  *out = ${call};`)
  } else {
    lines.push(`  ${call};`)
  }

  lines.push('  return CCJS_OK;')
  lines.push('}')

  return lines
}

function isRuntimeArrowCallbackWrapperWithContext(wrapper) {
  return wrapper.kind === 'arrow' && wrapper.captures.length > 0
}

function emitRuntimeArrowCallbackContextType(wrapper) {
  return [
    `typedef struct ${wrapper.contextTypeName} {`,
    ...wrapper.captures.map(capture => `  ${emitRuntimeArrowCaptureCType(capture)} ${emitRuntimeArrowCaptureField(capture)};`),
    `} ${wrapper.contextTypeName};`
  ]
}

function emitRuntimeArrowCallbackWrapperDeclaration(wrapper, baseContext) {
  const lines: string[] = []

  if (isRuntimeArrowCallbackWrapperWithContext(wrapper)) {
    lines.push(`static void ${wrapper.finalizerName}(void* context) {`)
    lines.push('  if (context == 0) return;')
    lines.push(`  ${wrapper.contextTypeName}* captured = (${wrapper.contextTypeName}*)context;`)

    for (const capture of wrapper.captures.filter(isRetainedRuntimeArrowCapture)) {
      lines.push(`  ccjs_release(captured->${emitRuntimeArrowCaptureField(capture)});`)
    }

    lines.push(`  ccjs_default_free(0, context, sizeof(${wrapper.contextTypeName}), _Alignof(${wrapper.contextTypeName}));`)
    lines.push('}')
    lines.push('')
  }

  const context = createFunctionContext(baseContext, 'void')
  context.cleanupEnabled = false
  context.statusReturn = true
  context.runtimeCallbackReturnType = wrapper.functionType.returnType
  context.runtimeCallbackReturnShape = wrapper.functionType.returnShape ?? null
  context.runtimeCallbackReturnOut = '(*out)'
  context.runtimeCallbackCleanupLabel = 'ccjs_callback_cleanup'
  const bodyLines: string[] = []

  bodyLines.push(...emitRuntimeArrowCallbackContextLocals(wrapper, context))
  bodyLines.push(...emitRuntimeArrowCallbackParamPrelude(wrapper, context))
  const statementLines = emitRuntimeArrowCallbackStatementLines(wrapper, context)

  lines.push(`${emitRuntimeCallbackWrapperHead(wrapper)} {`)

  if (isRuntimeArrowCallbackWrapperWithContext(wrapper)) {
    lines.push('  if (context == 0) return CCJS_ERR_TYPE;')
  } else {
    lines.push('  (void)context;')
  }

  lines.push(`  if (out == 0 || arg_count != ${wrapper.functionType.params.length}${wrapper.functionType.params.length === 0 ? '' : ' || args == 0'}) return CCJS_ERR_TYPE;`)
  lines.push('  *out = ccjs_undefined_value();')
  lines.push(...bodyLines.map(line => `  ${line}`))
  lines.push(...emitLoopFlowDeclarations(context).map(line => `  ${line}`))
  lines.push(...emitReturnFlowDeclarations(context).map(line => `  ${line}`))
  lines.push(...emitOwnedValueDeclarations(context).map(line => `  ${line}`))
  lines.push(...emitErrorChannelDeclarations(context).map(line => `  ${line}`))
  lines.push(...emitBoxedValueDeclarations(context).map(line => `  ${line}`))
  lines.push(...statementLines.map(line => `  ${line}`))
  if (context.usedRuntimeCallbackCleanupGoto === true) {
    lines.push(`${context.runtimeCallbackCleanupLabel}:`)
  }
  lines.push(...emitOwnedValueCleanup(context).map(line => `  ${line}`))
  lines.push(...emitBoxedValueCleanup(context).map(line => `  ${line}`))
  lines.push('  return CCJS_OK;')
  lines.push('}')

  return lines
}

function emitRuntimeArrowCallbackStatementLines(wrapper, context) {
  if (wrapper.functionType.returnType === 'number' || wrapper.functionType.returnType === 'boolean') {
    if (!wrapper.expression.expressionBody) {
      return emitStatementList(wrapper.expression.body, context)
    }

    const value = emitPreparedNumberExpression(wrapper.expression.body, context)
    const expression = wrapper.functionType.returnType === 'number'
      ? `ccjs_number_value(${value.expression})`
      : `ccjs_bool_value((${value.expression}) != 0)`

    return [
      ...value.lines,
      `*out = ${expression};`
    ]
  }

  if (isManagedRuntimeReturnType(wrapper.functionType.returnType)) {
    if (!wrapper.expression.expressionBody) {
      return emitStatementList(wrapper.expression.body, context)
    }

    return emitRuntimeCallbackRuntimeValueReturnLines(wrapper.expression.body, context)
  }

  const statements = wrapper.expression.expressionBody
    ? [{
        type: 'ExpressionStatement',
        expression: wrapper.expression.body
      }]
    : wrapper.expression.body

  return emitStatementList(statements, context)
}

function emitRuntimeArrowCallbackContextLocals(wrapper, context) {
  if (!isRuntimeArrowCallbackWrapperWithContext(wrapper)) {
    return []
  }

  const lines = [
    `${wrapper.contextTypeName}* captured = (${wrapper.contextTypeName}*)context;`
  ]

  for (const capture of wrapper.captures) {
    context.variables.set(capture.name, capture.valueType)

    if (isSupportedMutableRuntimeArrowCapture(capture, context)) {
      context.boxedVariables.add(capture.name)

      if (capture.valueType === 'object') {
        registerObjectShape(context, capture.name, capture.shape)
      }

      lines.push(`${emitRuntimeArrowCaptureCType(capture)} ${capture.name} = captured->${emitRuntimeArrowCaptureField(capture)};`)
      continue
    }

    if (isRetainedRuntimeArrowCapture(capture)) {
      if (capture.valueType === 'string') {
        context.runtimeStrings.add(capture.name)
        lines.push(`ccjs_string* ${capture.name} = (ccjs_string*)captured->${emitRuntimeArrowCaptureField(capture)}.as.ref;`)
        continue
      }

      if (capture.valueType === 'object') {
        registerObjectShape(context, capture.name, capture.shape)
        lines.push(`ccjs_value ${capture.name} = captured->${emitRuntimeArrowCaptureField(capture)};`)
        continue
      }
    }

    lines.push(`${emitRuntimeArrowCaptureCType(capture)} ${capture.name} = captured->${emitRuntimeArrowCaptureField(capture)};`)
  }

  return lines
}

function emitRuntimeArrowCallbackParamPrelude(wrapper, context) {
  const lines: string[] = []

  for (const [index, param] of wrapper.functionType.params.entries()) {
    const name = wrapper.expression.params[index]?.name ?? `ccjs_arg_${index}`

    lines.push(...emitRuntimeCallbackWrapperArgChecks(param, index))
    context.variables.set(name, param.valueType)

    if (param.valueType === 'string') {
      context.runtimeStrings.add(name)
      lines.push(`ccjs_string* ${name} = (ccjs_string*)args[${index}].as.ref;`)
      continue
    }

    if (param.valueType === 'object') {
      registerObjectShape(context, name, param.shape)
      lines.push(`ccjs_value ${name} = args[${index}];`)
      continue
    }

    if (param.valueType === 'number') {
      lines.push(`double ${name} = args[${index}].as.number;`)
      continue
    }

    if (param.valueType === 'boolean') {
      lines.push(`double ${name} = args[${index}].as.boolean ? 1 : 0;`)
    }
  }

  return lines
}

function emitRuntimeArrowCaptureCType(capture) {
  if (capture.mutable) {
    if (['number', 'boolean'].includes(capture.valueType)) {
      return 'double*'
    }

    if (['string', 'object'].includes(capture.valueType)) {
      return 'ccjs_value*'
    }
  }

  if (isRetainedRuntimeArrowCapture(capture)) {
    return 'ccjs_value'
  }

  if (capture.valueType === 'string') {
    return 'char*'
  }

  return 'double'
}

function emitRuntimeArrowCaptureField(capture) {
  return emitCIdentifier(capture.name)
}

function isRetainedRuntimeArrowCapture(capture) {
  return capture.runtimeManaged === true && ['string', 'object'].includes(capture.valueType) && !capture.mutable
}

function isSupportedMutableRuntimeArrowCapture(capture, context) {
  return capture.mutable
    && ['number', 'boolean', 'string', 'object'].includes(capture.valueType)
    && capture.declaration != null
    && context.boxedMutableCaptureDeclarations.has(capture.declaration)
}

function emitRuntimeCallbackWrapperArgChecks(param, index) {
  if (param.valueType === 'string') {
    return [`if (args[${index}].tag != CCJS_TAG_STRING || args[${index}].as.ref == 0) return CCJS_ERR_TYPE;`]
  }

  if (param.valueType === 'object') {
    return [`if (args[${index}].tag != CCJS_TAG_OBJECT || args[${index}].as.ref == 0) return CCJS_ERR_TYPE;`]
  }

  if (param.valueType === 'number') {
    return [`if (args[${index}].tag != CCJS_TAG_NUMBER) return CCJS_ERR_TYPE;`]
  }

  if (param.valueType === 'boolean') {
    return [`if (args[${index}].tag != CCJS_TAG_BOOL) return CCJS_ERR_TYPE;`]
  }

  return []
}

function emitRuntimeCallbackWrapperArg(param, index) {
  if (param.valueType === 'number') {
    return `args[${index}].as.number`
  }

  if (param.valueType === 'boolean') {
    return `(args[${index}].as.boolean ? 1 : 0)`
  }

  return `args[${index}]`
}

function emitFunctionPointerReturnType(functionType) {
  return emitCType(functionType?.returnType ?? 'void')
}

function emitFunctionPointerParams(functionType) {
  if (functionType == null || functionType.params.length === 0) {
    return 'void'
  }

  return functionType.params.map(param => emitCType(param.valueType)).join(', ')
}

function createFunctionContext(baseContext, returnType, returnNullable = false) {
  return {
    ...baseContext,
    arrayShapes: new Map(),
    breakFlowUsed: false,
    breakTargets: [],
    boxedValueTypes: new Map(),
    boxedValues: [],
    boxedVariables: new Set(),
    continueFlowUsed: false,
    continueTargets: [],
    cleanupEnabled: true,
    errorChannelUsed: false,
    errorObjectNames: new Set(),
    errorTargets: [],
    functionErrorOut: null,
    functionReturnOut: null,
    functionTypes: new Map(),
    mapTypes: new Map(),
    narrowedNullableScalars: new Set(),
    nullableVariables: new Set(),
    objectShapes: new Map(),
    ownedValues: [],
    returnFlowUsed: false,
    returnTargets: [],
    runtimeCallbacks: new Set(),
    runtimeArrayElementTypes: new Map(),
    setElementTypes: new Map(),
    runtimeStrings: new Set(),
    statusReturn: false,
    throwingFunction: false,
    usedCleanupGoto: false,
    variables: new Map(),
    returnNullable,
    returnType
  }
}

function emitMainWrapper(entryProgram, baseContext) {
  const context = createFunctionContext(baseContext, 'number')
  const main = entryProgram?.body.find(item => item.type === 'FunctionDeclaration' && item.name === 'main')

  if (main != null) {
    return [
      'int main(void) {',
      '  ccjs_main();',
      '  return 0;',
      '}'
    ]
  }

  const body = entryProgram?.body.filter(item => item.type !== 'FunctionDeclaration' && item.type !== 'ImportDeclaration') ?? []
  const bodyLines: string[] = []
  const lines = [
    'int main(void) {'
  ]

  bodyLines.push(...emitStatementList(body, context).map(line => `  ${line}`))

  lines.push(...emitLoopFlowDeclarations(context).map(line => `  ${line}`))
  lines.push(...emitReturnFlowDeclarations(context).map(line => `  ${line}`))
  lines.push(...emitOwnedValueDeclarations(context).map(line => `  ${line}`))
  lines.push(...emitErrorChannelDeclarations(context).map(line => `  ${line}`))
  lines.push(...emitBoxedValueDeclarations(context).map(line => `  ${line}`))
  lines.push(...bodyLines)

  if (shouldEmitCleanupLabel(context)) {
    lines.push('ccjs_cleanup:')
    lines.push(...emitOwnedValueCleanup(context).map(line => `  ${line}`))
    lines.push(...emitBoxedValueCleanup(context).map(line => `  ${line}`))
  }

  lines.push('  return 0;')
  lines.push('}')

  return lines
}

function emitCFunctionName(name) {
  return name === 'main' ? 'ccjs_main' : name
}

function emitCStringParamName(name) {
  return `ccjs_param_${name}`
}

function emitCScalarParamName(name) {
  return `ccjs_param_${name}`
}

function emitCObjectParamName(name) {
  return `ccjs_param_${name}`
}

function emitRuntimeParamPrelude(statement, context) {
  return statement.params.flatMap((param, index) => {
    if (isNullableScalarParam(param)) {
      const paramName = emitCScalarParamName(param.name)
      const expectedTag = cRuntimeValueTag(param.valueType)

      return [
        ...emitRuntimeNullableValueCheck(paramName, expectedTag, context),
        `ccjs_value ${param.name} = ${paramName};`
      ]
    }

    if (context.boxedMutableCaptureDeclarations.has(param) && ['string', 'object'].includes(param.valueType)) {
      const paramName = param.valueType === 'string' ? emitCStringParamName(param.name) : emitCObjectParamName(param.name)
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
      return [
        emitRuntimeTypeCheck(`${param.name}.tag != CCJS_TAG_OBJECT || ${param.name}.as.ref == 0`, context)
      ]
    }

    if (param.valueType === 'function' && resolveFunctionParameterRuntimeType(statement.name, index, param, context) != null) {
      if (param.nullable === true) {
        return emitRuntimeNullableValueCheck(param.name, 'CCJS_TAG_FUNCTION', context)
      }

      return [
        emitRuntimeTypeCheck(`${param.name}.tag != CCJS_TAG_FUNCTION || ${param.name}.as.ref == 0`, context)
      ]
    }

    if (context.boxedMutableCaptureDeclarations.has(param) && ['number', 'boolean'].includes(param.valueType)) {
      return [
        `${param.name} = ccjs_default_alloc(0, sizeof(double), _Alignof(double));`,
        `if (${param.name} == 0) ${emitFailureStatement(context)}`,
        `*${param.name} = ${emitCScalarParamName(param.name)};`
      ]
    }

    return []
  })
}

function emitCType(type) {
  if (type === 'void') {
    return 'void'
  }

  if (type === 'string') {
    return 'char*'
  }

  if (type === 'function') {
    return 'void*'
  }

  return 'double'
}

function emitCReturnType(type, nullable = false) {
  if (nullable && isNullableScalarType(type)) {
    return 'ccjs_value'
  }

  if (isManagedRuntimeReturnType(type)) {
    return 'ccjs_value'
  }

  return emitCType(type)
}

function emitThrowingFunctionOutType(type, nullable = false) {
  if (nullable && isNullableScalarType(type)) {
    return 'ccjs_value'
  }

  if (isManagedRuntimeReturnType(type)) {
    return 'ccjs_value'
  }

  return emitCType(type)
}

function emitThrowingFunctionPrelude(context) {
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

function isThrowingFunctionRuntimeOut(context) {
  return isManagedRuntimeReturnType(context.returnType) || (context.returnNullable === true && isNullableScalarType(context.returnType))
}

function emitStatement(statement, context) {
  if (statement.type === 'BlockStatement') {
    return withVariableScope(context, () => [
      '{',
      ...emitStatementBody(statement, context).map(line => `  ${line}`),
      '}'
    ])
  }

  if (statement.type === 'IfStatement') {
    return emitIfStatement(statement, context)
  }

  if (statement.type === 'WhileStatement') {
    return emitWhileStatement(statement, context)
  }

  if (statement.type === 'ForStatement') {
    return emitForStatement(statement, context)
  }

  if (statement.type === 'ForOfStatement') {
    return emitForOfStatement(statement, context)
  }

  if (statement.type === 'SwitchStatement') {
    return emitSwitchStatement(statement, context)
  }

  if (statement.type === 'TryStatement') {
    return emitTryStatement(statement, context)
  }

  if (statement.type === 'ThrowStatement') {
    return emitThrowStatement(statement, context)
  }

  if (statement.type === 'BreakStatement') {
    return emitBreakJump(context)
  }

  if (statement.type === 'ContinueStatement') {
    return emitContinueJump(context)
  }

  if (statement.type === 'VariableDeclaration') {
    if (isCollectionConstructorExpression(statement.init)) {
      return emitCollectionVariableDeclaration(statement, context)
    }

    const arrayMapCall = emitPreparedArrayMapCallExpression(statement.init, context)

    if (arrayMapCall != null) {
      return emitArrayMapVariableDeclaration(statement, arrayMapCall, context)
    }

    const arrayFilterCall = emitPreparedArrayFilterCallExpression(statement.init, context)

    if (arrayFilterCall != null) {
      return emitArrayFilterVariableDeclaration(statement, arrayFilterCall, context)
    }

    const arraySortCall = emitPreparedArraySortCallExpression(statement.init, context)

    if (arraySortCall != null) {
      return emitArraySortVariableDeclaration(statement, arraySortCall, context)
    }

    if (statement.nullable === true && isRuntimeNullableType(statement.valueType)) {
      return emitNullableRuntimeValueVariableDeclaration(statement, context)
    }

    if (isErrorConstructorExpression(statement.init)) {
      return emitErrorObjectVariableDeclaration(statement, context)
    }

    if (statement.init?.type === 'ObjectLiteral') {
      if (context.boxedMutableCaptureDeclarations.has(statement)) {
        return emitBoxedObjectVariableDeclaration(statement, context)
      }

      return emitObjectVariableDeclaration(statement, context)
    }

    if (statement.init?.type === 'ArrayLiteral') {
      return emitArrayVariableDeclaration(statement, context)
    }

    if (isMemberAccessExpression(statement.init)) {
      const member = resolveKnownObjectMember(statement.init, context)

      if (member != null) {
        return emitKnownObjectMemberVariableDeclaration(statement, member, context)
      }
    }

    if (isIndexAccessExpression(statement.init)) {
      const element = resolveKnownArrayIndex(statement.init, context)

      if (element != null) {
        return emitKnownArrayIndexVariableDeclaration(statement, element, context)
      }

      const field = resolveKnownObjectIndex(statement.init, context)

      if (field != null) {
        return emitDynamicObjectMemberVariableDeclaration(statement, field, context)
      }
    }

    if (statement.init?.type === 'CallExpression' && inferExpressionType(statement.init, context) === 'string') {
      return emitRuntimeStringVariableDeclaration(statement, statement.init, context)
    }

    return emitScalarVariableDeclaration(statement, context)
  }

  if (statement.type === 'ExpressionStatement' && isConsoleLog(statement.expression)) {
    return emitConsoleLogStatement(statement.expression.args, context)
  }

  if (statement.type === 'ExpressionStatement' && statement.expression.type === 'CallExpression') {
    const arrayMapCall = emitPreparedArrayMapCallExpression(statement.expression, context)

    if (arrayMapCall != null) {
      return arrayMapCall.lines
    }

    const arrayFilterCall = emitPreparedArrayFilterCallExpression(statement.expression, context)

    if (arrayFilterCall != null) {
      return arrayFilterCall.lines
    }

    const arraySortCall = emitPreparedArraySortCallExpression(statement.expression, context)

    if (arraySortCall != null) {
      return arraySortCall.lines
    }

    if (isArrayMethodCall(statement.expression)) {
      context.diagnostics.push(diagnostic('CCJS_C_ARRAY_METHOD', 'array methods are not supported by the current C backend slice', statement.loc))
      return []
    }

    const collectionCall = emitPreparedCollectionCallExpression(statement.expression, context)

    if (collectionCall != null) {
      return collectionCall.lines
    }

    const call = emitPreparedCallExpression(statement.expression, context)

    return call.expression === ''
      ? call.lines
      : [
          ...call.lines,
          `${call.expression};`
        ]
  }

  if (statement.type === 'ExpressionStatement' && statement.expression.type === 'AssignmentExpression') {
    if (statement.expression.target.type === 'MemberExpression') {
      const member = resolveKnownObjectMember(statement.expression.target, context)

      if (member != null) {
        return emitKnownObjectMemberAssignment(statement.expression, member, context)
      }
    }

    if (statement.expression.target.type === 'IndexExpression') {
      const element = resolveKnownArrayIndex(statement.expression.target, context)

      if (element != null) {
        return emitKnownArrayIndexAssignment(statement.expression, element, context)
      }

      const field = resolveKnownObjectIndex(statement.expression.target, context)

      if (field != null) {
        return emitDynamicObjectMemberAssignment(statement.expression, field, context)
      }
    }

    const valueType = inferExpressionType(statement.expression.value, context)

    if (isNullableRuntimeValueAssignment(statement.expression, context)) {
      return emitNullableRuntimeValueAssignment(statement.expression, context)
    }

    if (isBoxedRuntimeValueAssignment(statement.expression, context)) {
      return emitBoxedRuntimeValueAssignment(statement.expression, context)
    }

    if (valueType === 'number' || valueType === 'boolean') {
      const value = emitPreparedNumberExpression(statement.expression.value, context)

      return [
        ...value.lines,
        `${emitReference(statement.expression.target, context)} = ${value.expression};`
      ]
    }

    return [`${emitReference(statement.expression.target, context)} = ${emitCExpression(statement.expression.value, context)};`]
  }

  if (statement.type === 'ReturnStatement') {
    if (isRuntimeCallbackReturnContext(context)) {
      return emitRuntimeCallbackReturnStatement(statement, context)
    }

    if (context.returnNullable === true && isNullableScalarType(context.returnType)) {
      return emitNullableScalarReturnStatement(statement, context)
    }

    if (isManagedRuntimeReturnType(context.returnType)) {
      return emitRuntimeValueReturnStatement(statement, context)
    }

    if (context.returnType !== 'void') {
      const value = statement.argument == null
        ? {
            lines: [],
            expression: '0'
          }
        : emitPreparedNumberExpression(statement.argument, context)

      return [
        ...value.lines,
        `ccjs_return = ${value.expression};`,
        ...emitReturnJump(context)
      ]
    }

    if (statement.argument == null || context.returnType === 'void') {
      if (context.cleanupEnabled) {
        return emitReturnJump(context)
      }

      return ['return;']
    }

    return [`return ${emitCExpression(statement.argument, context)};`]
  }

  if (statement.type === 'ExpressionStatement' && statement.expression.type === 'OptionalCallExpression') {
    return emitOptionalRuntimeCallbackCallExpression(statement.expression, context)
  }

  return []
}

function emitIfStatement(statement, context) {
  const condition = emitPreparedNumberExpression(statement.condition, context)
  const narrowing = resolveNullableScalarConditionNarrowing(statement.condition, context)
  const lines = [
    ...condition.lines,
    `if (${condition.expression}) {`,
    ...withVariableScope(context, () => withNullableScalarNarrowing(context, narrowing.trueNames, () => emitStatementBody(statement.consequent, context))).map(line => `  ${line}`)
  ]

  if (statement.alternate == null) {
    lines.push('}')
    return lines
  }

  lines.push('} else {')
  lines.push(...withVariableScope(context, () => withNullableScalarNarrowing(context, narrowing.falseNames, () => emitStatementBody(statement.alternate, context))).map(line => `  ${line}`))
  lines.push('}')

  return lines
}

function emitWhileStatement(statement, context) {
  const condition = emitPreparedNumberExpression(statement.condition, context)
  const narrowing = resolveNullableScalarConditionNarrowing(statement.condition, context)
  const breakLabel = nextCName(context, 'ccjs_break')
  const continueLabel = nextCName(context, 'ccjs_continue')
  const body = withBreakTarget(context, breakLabel, false, () => withContinueTarget(context, continueLabel, false, () => withVariableScope(context, () => withNullableScalarNarrowing(context, narrowing.trueNames, () => emitStatementBody(statement.body, context)))))

  if (condition.lines.length === 0) {
    return [
      `while (${condition.expression}) {`,
      ...body.map(line => `  ${line}`),
      ...emitContinueTargetLabel(continueLabel, context),
      '}',
      ...emitBreakTargetLabel(breakLabel, context)
    ]
  }

  return [
    'while (1) {',
    ...condition.lines.map(line => `  ${line}`),
    `  if (!(${condition.expression})) break;`,
    ...body.map(line => `  ${line}`),
    ...emitContinueTargetLabel(continueLabel, context),
    '}',
    ...emitBreakTargetLabel(breakLabel, context)
  ]
}

function emitForStatement(statement, context) {
  return withVariableScope(context, () => {
    const init = emitPreparedForInitializer(statement.init, context)
    const test = emitPreparedForExpressionClause(statement.test, context)
    const update = emitPreparedForExpressionClause(statement.update, context)
    const narrowing = resolveNullableScalarConditionNarrowing(statement.test, context)
    const breakLabel = nextCName(context, 'ccjs_break')
    const continueLabel = nextCName(context, 'ccjs_continue')
    const body = withBreakTarget(context, breakLabel, false, () => withContinueTarget(context, continueLabel, false, () => withVariableScope(context, () => withNullableScalarNarrowing(context, narrowing.trueNames, () => emitStatementBody(statement.body, context)))))
    const needsPreparedLowering = init.lines.length > 0 || test.lines.length > 0 || update.lines.length > 0

    if (!needsPreparedLowering) {
      return [
        `for (${init.expression}; ${test.expression}; ${update.expression}) {`,
        ...body.map(line => `  ${line}`),
        ...emitContinueTargetLabel(continueLabel, context),
        '}',
        ...emitBreakTargetLabel(breakLabel, context)
      ]
    }

    const lines = [
      '{'
    ]

    lines.push(...init.lines.map(line => `  ${line}`))

    if (init.expression !== '') {
      lines.push(`  ${init.expression};`)
    }

    lines.push('  for (;;) {')
    lines.push(...test.lines.map(line => `    ${line}`))

    if (test.expression !== '') {
      lines.push(`    if (!(${test.expression})) break;`)
    }

    lines.push(...body.map(line => `    ${line}`))
    lines.push(...emitContinueTargetLabel(continueLabel, context).map(line => `  ${line}`))
    lines.push(...update.lines.map(line => `    ${line}`))

    if (update.expression !== '') {
      lines.push(`    ${update.expression};`)
    }

    lines.push('  }')
    lines.push(...emitBreakTargetLabel(breakLabel, context).map(line => `  ${line}`))
    lines.push('}')

    return lines
  })
}

function emitForOfStatement(statement, context) {
  const setup: string[] = []
  let array: any = resolveKnownForOfArray(statement.iterable, context)
  let runtimeArray: any = null

  if (array == null && statement.iterable?.type === 'ArrayLiteral') {
    const name = nextCName(context, 'ccjs_for_array')

    setup.push(...emitArrayVariableDeclaration({
      kind: 'const',
      name,
      init: statement.iterable
    }, context))
    array = resolveKnownForOfArray({
      type: 'Reference',
      path: [name]
    }, context)
  }

  if (array == null) {
    runtimeArray = resolveRuntimeForOfArray(statement.iterable, context)
  }

  if (array == null && runtimeArray == null) {
    context.diagnostics.push(diagnostic('CCJS_C_FOR_OF', 'C for...of currently supports only local array variables and array literals', statement.loc))
    return []
  }

  const elementType = runtimeArray?.elementType ?? resolveForOfElementType(array.elements)

  if (!['number', 'boolean', 'string'].includes(elementType)) {
    context.diagnostics.push(diagnostic('CCJS_C_FOR_OF', 'C for...of currently supports only uniform number/boolean/string arrays', statement.loc))
    return []
  }

  const index = nextCName(context, 'ccjs_for_index')
  const value = nextCName(context, 'ccjs_for_value')
  const length = runtimeArray == null ? `${array.elements.length}` : nextCName(context, 'ccjs_for_length')
  const arrayName = runtimeArray?.name ?? array.name
  const breakLabel = nextCName(context, 'ccjs_break')
  const continueLabel = nextCName(context, 'ccjs_continue')
  const loopValue = elementType === 'boolean'
    ? `((double)(${value}.as.boolean ? 1 : 0))`
    : `${value}.as.number`

  registerOwnedValue(context, value)

  return withVariableScope(context, () => {
    context.variables.set(statement.name, elementType)
    if (elementType === 'string') {
      context.runtimeStrings.add(statement.name)
    }
    const body = withBreakTarget(context, breakLabel, false, () => withContinueTarget(context, continueLabel, false, () => withVariableScope(context, () => emitStatementBody(statement.body, context))))
    const declaration = elementType === 'string'
      ? `ccjs_string* ${statement.name} = (ccjs_string*)${value}.as.ref;`
      : `double ${statement.name} = ${loopValue};`
    const checks = elementType === 'string'
      ? [emitRuntimeTypeCheck(`${value}.tag != CCJS_TAG_STRING || ${value}.as.ref == 0`, context)]
      : []

    return [
      ...setup,
      ...(runtimeArray?.lines ?? []),
      ...(runtimeArray == null
        ? []
        : [
            `size_t ${length} = 0;`,
            emitStatusCheck(`ccjs_array_len(${arrayName}, &${length})`, context)
          ]),
      `for (size_t ${index} = 0; ${index} < ${length}; ${index} += 1) {`,
      ...emitPrepareOwnedValueWrite(value).map(line => `  ${line}`),
      `  ${emitStatusCheck(`ccjs_array_get(${arrayName}, ${index}, &${value})`, context)}`,
      ...checks.map(line => `  ${line}`),
      `  ${declaration}`,
      ...body.map(line => `  ${line}`),
      ...emitContinueTargetLabel(continueLabel, context),
      '}',
      ...emitBreakTargetLabel(breakLabel, context),
      ...emitPrepareOwnedValueWrite(value)
    ]
  })
}

function emitSwitchStatement(statement, context) {
  const discriminant = emitPreparedNumberExpression(statement.discriminant, context)
  const breakLabel = nextCName(context, 'ccjs_break')
  const lines = [
    ...discriminant.lines,
    `switch ((int)${discriminant.expression}) {`
  ]

  for (const item of statement.cases) {
    lines.push(item.test == null ? '  default: {' : `  case ${emitSwitchCaseLabel(item.test, context)}: {`)
    lines.push(...withBreakTarget(context, breakLabel, false, () => withVariableScope(context, () => emitStatementList(item.consequent, context))).map(line => `    ${line}`))
    lines.push('  }')
  }

  lines.push('}')
  lines.push(...emitBreakTargetLabel(breakLabel, context))

  return lines
}

function emitSwitchCaseLabel(expression, context) {
  if (expression?.type === 'NumberLiteral') {
    return `(int)${expression.value}`
  }

  if (expression?.type === 'BooleanLiteral') {
    return `(int)${expression.value ? '1' : '0'}`
  }

  if (expression?.type === 'UnaryExpression' && expression.argument.type === 'NumberLiteral' && ['+', '-'].includes(expression.operator)) {
    return `(int)(${expression.operator}${expression.argument.value})`
  }

  context.diagnostics.push(diagnostic('CCJS_C_SWITCH_CASE', 'C switch case labels must be numeric or boolean literals in the current backend slice', expression?.loc))

  return '0'
}

function emitTryStatement(statement, context) {
  registerErrorChannel(context)

  const id = nextCName(context, 'ccjs_try')
  const catchLabel = statement.handler == null ? null : `${id}_catch`
  const finallyLabel = statement.finalizer == null ? null : `${id}_finally`
  const endLabel = `${id}_end`
  const throwTarget = catchLabel ?? finallyLabel
  const outerReturnTarget = currentReturnTarget(context)
  const outerBreakTarget = currentBreakTarget(context)
  const outerContinueTarget = currentContinueTarget(context)
  const lines = [
    '{'
  ]
  const tryBody = withErrorTarget(context, throwTarget, () => withFinallyFlowTarget(context, finallyLabel, () => withVariableScope(context, () => emitStatementBody(statement.block, context))))

  lines.push(...tryBody.map(line => `  ${line}`))
  lines.push(`  goto ${finallyLabel ?? endLabel};`)

  if (statement.handler != null && catchLabel != null) {
    const catchValueType = inferCatchBindingValueType(statement, context)
    const catchBody = withFinallyFlowTarget(context, finallyLabel, () => withVariableScope(context, () => {
      const body: string[] = []

      if (statement.handler.param != null) {
        if (catchValueType === 'object') {
          context.variables.set(statement.handler.param, 'object')
          registerErrorObjectShape(context, statement.handler.param)
          body.push(`ccjs_value ${statement.handler.param} = ccjs_error;`)
        } else {
          context.variables.set(statement.handler.param, 'string')
          context.runtimeStrings.add(statement.handler.param)
          body.push(`ccjs_string* ${statement.handler.param} = (ccjs_string*)ccjs_error.as.ref;`)
        }
      }

      body.push(...emitStatementBody(statement.handler.body, context))

      return body
    }))

    lines.push(`${catchLabel}:`)
    lines.push(`  if (${emitCatchBindingTypeCheck(catchValueType)}) ${emitFailureStatement(context)}`)
    lines.push('  ccjs_error_active = 0;')
    lines.push('  {')
    lines.push(...catchBody.map(line => `    ${line}`))
    lines.push('  }')
    lines.push('  ccjs_release(ccjs_error);')
    lines.push('  ccjs_error = ccjs_undefined_value();')
  }

  if (statement.finalizer != null && finallyLabel != null) {
    const outerThrowTarget = currentErrorTarget(context)
    const finalizerBody = withErrorTarget(context, outerThrowTarget, () => withReturnTarget(context, outerReturnTarget, () => withBreakTarget(context, outerBreakTarget?.label ?? null, outerBreakTarget?.throughFinally === true, () => withContinueTarget(context, outerContinueTarget?.label ?? null, outerContinueTarget?.throughFinally === true, () => withVariableScope(context, () => emitStatementBody(statement.finalizer, context))))))

    lines.push(`${finallyLabel}:`)
    lines.push(...finalizerBody.map(line => `  ${line}`))

    if (outerThrowTarget != null) {
      lines.push(`  if (ccjs_error_active) goto ${outerThrowTarget};`)
    } else {
      lines.push(`  if (ccjs_error_active) ${emitFailureStatement(context)}`)
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

function emitThrowStatement(statement, context) {
  const target = currentErrorTarget(context)

  if (target == null && !context.throwingFunction) {
    context.diagnostics.push(diagnostic('CCJS_C_THROW', 'uncaught throw is not supported by the current C backend slice', statement.loc))
    return []
  }

  const isErrorObject = isErrorValueExpression(statement.argument, context)

  if (inferExpressionType(statement.argument, context) !== 'string' && !isErrorObject) {
    context.diagnostics.push(diagnostic('CCJS_C_THROW', 'C throw currently supports only string values and lightweight Error objects in local try/catch regions', statement.loc))
    return []
  }

  registerErrorChannel(context)

  const value = emitCValueExpression(statement.argument, context)

  return [
    ...value.lines,
    ...emitPrepareOwnedValueWrite('ccjs_error'),
    `ccjs_error = ${value.expression};`,
    emitRuntimeTypeCheck(isErrorObject ? 'ccjs_error.tag != CCJS_TAG_OBJECT || ccjs_error.as.ref == 0' : 'ccjs_error.tag != CCJS_TAG_STRING || ccjs_error.as.ref == 0', context),
    'ccjs_retain(ccjs_error);',
    ...(target == null
      ? [
          'ccjs_status_result = CCJS_ERR_THROW;'
        ]
      : []),
    'ccjs_error_active = 1;',
    `goto ${target ?? 'ccjs_cleanup'};`
  ]
}

function inferCatchBindingValueType(statement, context) {
  const types = collectLocalThrowValueTypes(statement.block, context, new Set(context.errorObjectNames))

  return types.length > 0 && types.every(type => type === 'error') ? 'object' : 'string'
}

function collectLocalThrowValueTypes(statement, context, errorObjectNames = new Set(context.errorObjectNames)) {
  if (statement == null) {
    return []
  }

  if (statement.type === 'ThrowStatement') {
    if (isKnownErrorValueExpression(statement.argument, context, errorObjectNames)) {
      return ['error']
    }

    return inferExpressionType(statement.argument, context) === 'string' ? ['string'] : ['other']
  }

  if (statement.type === 'VariableDeclaration') {
    const types = collectLocalThrowValueTypesFromExpression(statement.init, context, errorObjectNames)

    if (isKnownErrorValueExpression(statement.init, context, errorObjectNames)) {
      errorObjectNames.add(statement.name)
    }

    return types
  }

  if (statement.type === 'ExpressionStatement') {
    return collectLocalThrowValueTypesFromExpression(statement.expression, context, errorObjectNames)
  }

  if (statement.type === 'ReturnStatement') {
    return collectLocalThrowValueTypesFromExpression(statement.argument, context, errorObjectNames)
  }

  if (statement.type === 'BlockStatement') {
    const scopedErrorObjectNames = new Set(errorObjectNames)

    return statement.body.flatMap(item => collectLocalThrowValueTypes(item, context, scopedErrorObjectNames))
  }

  if (statement.type === 'IfStatement') {
    return [
      ...collectLocalThrowValueTypes(statement.consequent, context, new Set(errorObjectNames)),
      ...collectLocalThrowValueTypes(statement.alternate, context, new Set(errorObjectNames))
    ]
  }

  if (statement.type === 'WhileStatement' || statement.type === 'ForOfStatement') {
    return collectLocalThrowValueTypes(statement.body, context, new Set(errorObjectNames))
  }

  if (statement.type === 'ForStatement') {
    return collectLocalThrowValueTypes(statement.body, context, new Set(errorObjectNames))
  }

  if (statement.type === 'SwitchStatement') {
    return statement.cases.flatMap(item => {
      const scopedErrorObjectNames = new Set(errorObjectNames)

      return item.consequent.flatMap(child => collectLocalThrowValueTypes(child, context, scopedErrorObjectNames))
    })
  }

  if (statement.type === 'TryStatement') {
    if (statement.handler != null) {
      return [
        ...collectLocalThrowValueTypes(statement.handler.body, context, new Set(errorObjectNames)),
        ...collectLocalThrowValueTypes(statement.finalizer, context, new Set(errorObjectNames))
      ]
    }

    return [
      ...collectLocalThrowValueTypes(statement.block, context, new Set(errorObjectNames)),
      ...collectLocalThrowValueTypes(statement.finalizer, context, new Set(errorObjectNames))
    ]
  }

  return []
}

function collectLocalThrowValueTypesFromExpression(expression, context, errorObjectNames) {
  if (expression == null) {
    return []
  }

  if (expression.type === 'CallExpression') {
    const types = expression.callee.type === 'Reference' && expression.callee.path.length === 1 && isThrowingFunctionName(expression.callee.path[0], context)
      ? context.functionThrowValueTypes.get(expression.callee.path[0]) ?? ['other']
      : []

    return [
      ...types,
      ...collectLocalThrowValueTypesFromExpression(expression.callee, context, errorObjectNames),
      ...expression.args.flatMap(arg => collectLocalThrowValueTypesFromExpression(arg, context, errorObjectNames))
    ]
  }

  if (expression.type === 'NewExpression' || expression.type === 'OptionalCallExpression') {
    return [
      ...collectLocalThrowValueTypesFromExpression(expression.callee, context, errorObjectNames),
      ...expression.args.flatMap(arg => collectLocalThrowValueTypesFromExpression(arg, context, errorObjectNames))
    ]
  }

  if (expression.type === 'MemberExpression' || expression.type === 'OptionalMemberExpression') {
    return collectLocalThrowValueTypesFromExpression(expression.object, context, errorObjectNames)
  }

  if (expression.type === 'IndexExpression' || expression.type === 'OptionalIndexExpression') {
    return [
      ...collectLocalThrowValueTypesFromExpression(expression.object, context, errorObjectNames),
      ...collectLocalThrowValueTypesFromExpression(expression.index, context, errorObjectNames)
    ]
  }

  if (expression.type === 'AssignmentExpression') {
    return [
      ...collectLocalThrowValueTypesFromExpression(expression.target, context, errorObjectNames),
      ...collectLocalThrowValueTypesFromExpression(expression.value, context, errorObjectNames)
    ]
  }

  if (expression.type === 'BinaryExpression') {
    return [
      ...collectLocalThrowValueTypesFromExpression(expression.left, context, errorObjectNames),
      ...collectLocalThrowValueTypesFromExpression(expression.right, context, errorObjectNames)
    ]
  }

  if (expression.type === 'UnaryExpression' || expression.type === 'AwaitExpression') {
    return collectLocalThrowValueTypesFromExpression(expression.argument, context, errorObjectNames)
  }

  if (expression.type === 'ArrayLiteral') {
    return expression.elements.flatMap(item => collectLocalThrowValueTypesFromExpression(item, context, errorObjectNames))
  }

  if (expression.type === 'ObjectLiteral') {
    return expression.properties.flatMap(property => collectLocalThrowValueTypesFromExpression(property.value, context, errorObjectNames))
  }

  return []
}

function emitCatchBindingTypeCheck(valueType) {
  return valueType === 'object'
    ? 'ccjs_error.tag != CCJS_TAG_OBJECT || ccjs_error.as.ref == 0'
    : 'ccjs_error.tag != CCJS_TAG_STRING || ccjs_error.as.ref == 0'
}

function registerErrorChannel(context) {
  context.errorChannelUsed = true
  registerOwnedValue(context, 'ccjs_error')
}

function currentErrorTarget(context) {
  return context.errorTargets.at(-1) ?? null
}

function emitBreakJump(context) {
  const target = currentBreakTarget(context)

  if (target == null) {
    return ['break;']
  }

  if (target.throughFinally) {
    registerBreakFlow(context)

    return [
      'ccjs_break_active = 1;',
      `goto ${target.label};`
    ]
  }

  return [`goto ${target.label};`]
}

function emitContinueJump(context) {
  const target = currentContinueTarget(context)

  if (target == null) {
    return ['continue;']
  }

  if (target.throughFinally) {
    registerContinueFlow(context)

    return [
      'ccjs_continue_active = 1;',
      `goto ${target.label};`
    ]
  }

  return [`goto ${target.label};`]
}

function emitBreakTargetLabel(label, context) {
  return [
    `${label}:`,
    ...(context.breakFlowUsed ? ['  if (ccjs_break_active) ccjs_break_active = 0;'] : []),
    ';'
  ]
}

function emitContinueTargetLabel(label, context) {
  return [
    `${label}:`,
    ...(context.continueFlowUsed ? ['  if (ccjs_continue_active) ccjs_continue_active = 0;'] : []),
    '  ;'
  ]
}

function registerBreakFlow(context) {
  context.breakFlowUsed = true
}

function registerContinueFlow(context) {
  context.continueFlowUsed = true
}

function currentBreakTarget(context) {
  return context.breakTargets.at(-1) ?? null
}

function currentContinueTarget(context) {
  return context.continueTargets.at(-1) ?? null
}

function withBreakTarget(context, label, throughFinally, callback) {
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

function withContinueTarget(context, label, throughFinally, callback) {
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

function withFinallyFlowTarget(context, label, callback) {
  return withReturnTarget(context, label, () => withBreakTarget(context, label, true, () => withContinueTarget(context, label, true, callback)))
}

function emitReturnJump(context) {
  const target = currentReturnTarget(context)

  if (target != null) {
    registerReturnFlow(context)

    return [
      'ccjs_return_active = 1;',
      `goto ${target};`
    ]
  }

  return [emitReturnCleanupStatement(context)]
}

function emitReturnCleanupStatement(context) {
  if (context.statusReturn && context.runtimeCallbackCleanupLabel != null) {
    context.usedRuntimeCallbackCleanupGoto = true

    return `goto ${context.runtimeCallbackCleanupLabel};`
  }

  if (context.cleanupEnabled) {
    context.usedCleanupGoto = true

    return 'goto ccjs_cleanup;'
  }

  return context.returnType === 'void' ? 'return;' : 'return ccjs_return;'
}

function registerReturnFlow(context) {
  context.returnFlowUsed = true
}

function currentReturnTarget(context) {
  return context.returnTargets.at(-1) ?? null
}

function withReturnTarget(context, target, callback) {
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

function withErrorTarget(context, target, callback) {
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

function emitStatementBody(statement, context) {
  if (statement.type === 'BlockStatement') {
    return emitStatementList(statement.body, context)
  }

  return emitStatement(statement, context)
}

function emitStatementList(statements, context) {
  return statements.flatMap(statement => {
    const lines = emitStatement(statement, context)

    applyNullableScalarEarlyReturnNarrowing(statement, context)

    return lines
  })
}

function applyNullableScalarEarlyReturnNarrowing(statement, context) {
  if (statement.type !== 'IfStatement' || statement.alternate != null || !statementDefinitelyReturns(statement.consequent)) {
    return
  }

  const narrowing = resolveNullableScalarConditionNarrowing(statement.condition, context)

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

function emitForInitializer(init, context) {
  if (init == null) {
    return ''
  }

  if (init.type === 'VariableDeclaration') {
    return emitVariableDeclaration(init, context)
  }

  return emitCExpression(init, context)
}

function emitPreparedForInitializer(init, context) {
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

function emitPreparedForVariableDeclaration(statement, context) {
  if (isCollectionConstructorExpression(statement.init)) {
    return {
      lines: emitCollectionVariableDeclaration(statement, context),
      expression: ''
    }
  }

  const arrayMapCall = emitPreparedArrayMapCallExpression(statement.init, context)

  if (arrayMapCall != null) {
    return {
      lines: emitArrayMapVariableDeclaration(statement, arrayMapCall, context),
      expression: ''
    }
  }

  const arrayFilterCall = emitPreparedArrayFilterCallExpression(statement.init, context)

  if (arrayFilterCall != null) {
    return {
      lines: emitArrayFilterVariableDeclaration(statement, arrayFilterCall, context),
      expression: ''
    }
  }

  const arraySortCall = emitPreparedArraySortCallExpression(statement.init, context)

  if (arraySortCall != null) {
    return {
      lines: emitArraySortVariableDeclaration(statement, arraySortCall, context),
      expression: ''
    }
  }

  if (statement.nullable === true && isRuntimeNullableType(statement.valueType)) {
    return {
      lines: emitNullableRuntimeValueVariableDeclaration(statement, context),
      expression: ''
    }
  }

  if (isErrorConstructorExpression(statement.init)) {
    return {
      lines: emitErrorObjectVariableDeclaration(statement, context),
      expression: ''
    }
  }

  if (statement.init?.type === 'ObjectLiteral') {
    return {
      lines: emitObjectVariableDeclaration(statement, context),
      expression: ''
    }
  }

  if (statement.init?.type === 'ArrayLiteral') {
    return {
      lines: emitArrayVariableDeclaration(statement, context),
      expression: ''
    }
  }

  if (isMemberAccessExpression(statement.init)) {
    const member = resolveKnownObjectMember(statement.init, context)

    if (member != null) {
      return {
        lines: emitKnownObjectMemberVariableDeclaration(statement, member, context),
        expression: ''
      }
    }
  }

  if (isIndexAccessExpression(statement.init)) {
    const element = resolveKnownArrayIndex(statement.init, context)

    if (element != null) {
      return {
        lines: emitKnownArrayIndexVariableDeclaration(statement, element, context),
        expression: ''
      }
    }

    const field = resolveKnownObjectIndex(statement.init, context)

    if (field != null) {
      return {
        lines: emitDynamicObjectMemberVariableDeclaration(statement, field, context),
        expression: ''
      }
    }
  }

  if (isRuntimeProducedStringExpression(statement.init, context)) {
    return {
      lines: emitRuntimeStringVariableDeclaration(statement, statement.init, context),
      expression: ''
    }
  }

  const inferred = inferExpressionType(statement.init, context)
  context.variables.set(statement.name, inferred)

  if (inferred === 'string') {
    if (context.boxedMutableCaptureDeclarations.has(statement)) {
      return emitBoxedRuntimeValueVariableDeclaration(statement, statement.init, context)
    }

    const runtimeString = resolveRuntimeStringReference(statement.init, context)

    if (runtimeString != null) {
      context.runtimeStrings.add(statement.name)
      return {
        lines: [],
        expression: `${statement.kind === 'const' ? 'const ' : ''}ccjs_string* ${statement.name} = ${runtimeString}`
      }
    }

    if (isRuntimeProducedStringExpression(statement.init, context)) {
      return {
        lines: emitRuntimeStringVariableDeclaration(statement, statement.init, context),
        expression: ''
      }
    }

    return {
      lines: [],
      expression: `${statement.kind === 'const' ? 'const ' : ''}char* ${statement.name} = ${emitStringExpression(statement.init, context)}`
    }
  }

  if (inferred === 'function') {
    context.variables.set(statement.name, 'function')
    context.functionTypes.set(statement.name, statement.functionType)

    if (isRuntimeFunctionType(statement.functionType)) {
      return {
        lines: emitRuntimeCallbackVariableDeclaration(statement, context),
        expression: ''
      }
    }

    return {
      lines: [],
      expression: emitFunctionPointerVariable(statement.name, statement.init, context, statement.kind === 'const', statement.functionType, statement.loc)
    }
  }

  if (!['number', 'boolean'].includes(inferred)) {
    context.diagnostics.push(diagnostic(cUnsupportedExpressionCode(inferred), 'this expression is not supported by the current C backend slice', statement.loc))

    return {
      lines: [],
      expression: `double ${statement.name} = 0`
    }
  }

  const value = emitPreparedNumberExpression(statement.init, context)

  return {
    lines: value.lines,
    expression: `${statement.kind === 'const' ? 'const ' : ''}double ${statement.name} = ${value.expression}`
  }
}

function emitPreparedForExpressionClause(expression, context) {
  if (expression == null) {
    return {
      lines: [],
      expression: ''
    }
  }

  return emitPreparedNumberExpression(expression, context)
}

function isRuntimeCallbackReturnContext(context) {
  return context.statusReturn === true && ['number', 'boolean', 'string', 'object'].includes(context.runtimeCallbackReturnType)
}

function emitRuntimeCallbackReturnStatement(statement, context) {
  const lines = isManagedRuntimeReturnType(context.runtimeCallbackReturnType)
    ? emitRuntimeCallbackRuntimeValueReturnLines(statement.argument, context)
    : emitRuntimeCallbackScalarReturnLines(statement.argument, context)

  return [
    ...lines,
    ...emitReturnJump(context)
  ]
}

function emitRuntimeCallbackScalarReturnLines(argument, context) {
  const value = argument == null
    ? {
        lines: [],
        expression: '0'
      }
    : emitPreparedNumberExpression(argument, context)
  const expression = context.runtimeCallbackReturnType === 'number'
    ? `ccjs_number_value(${value.expression})`
    : `ccjs_bool_value((${value.expression}) != 0)`

  return [
    ...value.lines,
    `${context.runtimeCallbackReturnOut} = ${expression};`
  ]
}

function emitRuntimeCallbackRuntimeValueReturnLines(argument, context) {
  const expectedTag = cRuntimeValueTag(context.runtimeCallbackReturnType)
  const value = argument == null
    ? {
        lines: [],
        expression: 'ccjs_undefined_value()'
      }
    : emitRuntimeReturnValueExpression(argument, context, context.runtimeCallbackReturnType, context.runtimeCallbackReturnShape)

  return [
    ...value.lines,
    `${context.runtimeCallbackReturnOut} = ${value.expression};`,
    emitRuntimeValueCheck(context.runtimeCallbackReturnOut, expectedTag, context),
    `ccjs_retain(${context.runtimeCallbackReturnOut});`
  ]
}

function isManagedRuntimeReturnType(valueType) {
  return valueType === 'string' || valueType === 'object'
}

function emitRuntimeReturnValueExpression(argument, context, returnType, returnShape) {
  if (returnType === 'object' && argument?.type === 'ObjectLiteral') {
    return emitCObjectLiteralValueExpression(argument, context, returnShape)
  }

  return emitCValueExpression(argument, context)
}

function emitRuntimeValueReturnStatement(statement, context) {
  if (statement.argument == null) {
    return emitReturnJump(context)
  }

  const expectedTag = cRuntimeValueTag(context.returnType)
  const value = emitRuntimeReturnValueExpression(statement.argument, context, context.returnType, context.returnShape)

  return [
    ...value.lines,
    `ccjs_return = ${value.expression};`,
    emitRuntimeValueCheck('ccjs_return', expectedTag, context),
    'ccjs_retain(ccjs_return);',
    ...emitReturnJump(context)
  ]
}

function emitNullableScalarReturnStatement(statement, context) {
  const expectedTag = cRuntimeValueTag(context.returnType)
  const value = statement.argument == null
    ? {
        lines: [],
        expression: 'ccjs_null_value()'
      }
    : emitNullableScalarValueExpression(statement.argument, context)

  return [
    ...value.lines,
    `ccjs_return = ${value.expression};`,
    ...emitRuntimeNullableValueCheck('ccjs_return', expectedTag, context),
    ...emitReturnJump(context)
  ]
}

function emitRuntimeStringVariableDeclaration(statement, expression, context) {
  const value = emitCValueExpression(expression, context)
  const lines = [
    ...value.lines,
    `${statement.kind === 'const' ? 'const ' : ''}ccjs_string* ${statement.name} = (ccjs_string*)${value.expression}.as.ref;`
  ]

  context.variables.set(statement.name, 'string')
  context.runtimeStrings.add(statement.name)

  return lines
}

function reportCCollectionHashability(valueType, subject, loc, context) {
  if (valueType == null || valueType === 'unknown' || isCCollectionHashableType(valueType)) {
    return
  }

  context.diagnostics.push(diagnostic('CCJS_C_COLLECTION', `${subject} must be hashable in the current C backend slice`, loc))
}

function isCCollectionHashableType(valueType) {
  return valueType === 'number' || valueType === 'boolean' || valueType === 'string'
}

function emitCollectionVariableDeclaration(statement, context) {
  const constructor = collectionConstructorName(statement.init)

  if (constructor == null) {
    context.diagnostics.push(diagnostic('CCJS_C_COLLECTION', 'this collection constructor is not supported by the current C backend slice', statement.loc))
    return [`double ${statement.name} = 0;`]
  }

  if (statement.init.args.length > 1) {
    context.diagnostics.push(diagnostic('CCJS_C_COLLECTION', 'C collection constructors currently support at most one array literal iterable', statement.init.loc))
  }

  registerOwnedValue(context, statement.name)

  if (constructor === 'Map') {
    context.variables.set(statement.name, 'map')
    context.mapTypes.set(statement.name, {
      key: statement.mapKeyType ?? 'unknown',
      value: statement.mapValueType ?? 'unknown'
    })
    reportCCollectionHashability(statement.mapKeyType, 'Map keys', statement.loc, context)

    const lines = [
      ...emitPrepareOwnedValueWrite(statement.name),
      emitStatusCheck(`ccjs_map_new(&ccjs_default_allocator, &${statement.name})`, context)
    ]

    lines.push(...emitMapConstructorEntries(statement.name, statement.init.args[0], context, statement.init.loc))

    return lines
  }

  context.variables.set(statement.name, 'set')
  context.setElementTypes.set(statement.name, statement.setElementType ?? 'unknown')
  reportCCollectionHashability(statement.setElementType, 'Set values', statement.loc, context)

  const lines = [
    ...emitPrepareOwnedValueWrite(statement.name),
    emitStatusCheck(`ccjs_set_new(&ccjs_default_allocator, &${statement.name})`, context)
  ]

  lines.push(...emitSetConstructorValues(statement.name, statement.init.args[0], context, statement.init.loc))

  return lines
}

function emitMapConstructorEntries(name, expression, context, loc) {
  if (expression == null) {
    return []
  }

  if (expression.type !== 'ArrayLiteral') {
    context.diagnostics.push(diagnostic('CCJS_C_COLLECTION', 'C Map constructor currently supports only array literal entries', expression.loc ?? loc))
    return []
  }

  const lines: string[] = []

  for (const entry of expression.elements) {
    if (entry.type !== 'ArrayLiteral' || entry.elements.length !== 2) {
      context.diagnostics.push(diagnostic('CCJS_C_COLLECTION', 'C Map constructor entries must be [key, value] array literals', entry.loc ?? loc))
      continue
    }

    const key = emitCValueExpression(entry.elements[0], context)
    const value = emitCValueExpression(entry.elements[1], context)
    reportCCollectionHashability(inferExpressionType(entry.elements[0], context), 'Map keys', entry.elements[0].loc ?? entry.loc ?? loc, context)

    lines.push(...key.lines)
    lines.push(...value.lines)
    lines.push(emitStatusCheck(`ccjs_map_set(${name}, ${key.expression}, ${value.expression})`, context))
  }

  return lines
}

function emitSetConstructorValues(name, expression, context, loc) {
  if (expression == null) {
    return []
  }

  if (expression.type !== 'ArrayLiteral') {
    context.diagnostics.push(diagnostic('CCJS_C_COLLECTION', 'C Set constructor currently supports only array literal values', expression.loc ?? loc))
    return []
  }

  const lines: string[] = []

  for (const element of expression.elements) {
    const value = emitCValueExpression(element, context)
    reportCCollectionHashability(inferExpressionType(element, context), 'Set values', element.loc ?? loc, context)

    lines.push(...value.lines)
    lines.push(emitStatusCheck(`ccjs_set_add(${name}, ${value.expression})`, context))
  }

  return lines
}

function emitObjectVariableDeclaration(statement, context) {
  const shapeName = nextCName(context, `ccjs_shape_${statement.name}`)
  const fieldsName = `${shapeName}_fields`
  const fields = statement.shape?.fields ?? statement.init.properties.map(property => ({
    name: property.key,
    readonly: false,
    valueType: inferExpressionType(property.value, context)
  }))
  const properties = new Map<string, AnyNode>(statement.init.properties.map(property => [property.key, property]))
  const lines = [
    `static const ccjs_field_info ${fieldsName}[] = {`
  ]

  for (const field of fields) {
    lines.push(`  { ${cStringLiteral(field.name)}, ${field.readonly ? 'CCJS_FIELD_READONLY' : '0'} },`)
  }

  lines.push('};')
  lines.push(`static const ccjs_shape ${shapeName} = {`)
  lines.push(`  ${fields.length},`)
  lines.push(`  ${fieldsName}`)
  lines.push('};')
  registerOwnedValue(context, statement.name)
  lines.push(...emitPrepareOwnedValueWrite(statement.name))
  lines.push(emitStatusCheck(`ccjs_object_new(&ccjs_default_allocator, &${shapeName}, &${statement.name})`, context))

  context.variables.set(statement.name, 'object')
  context.objectShapes.set(statement.name, fields.map(field => ({
    name: field.name,
    valueType: field.valueType,
    arrayElementType: field.arrayElementType,
    mapKeyType: field.mapKeyType,
    mapValueType: field.mapValueType,
    setElementType: field.setElementType
  })))

  for (const [index, field] of fields.entries()) {
    const property = properties.get(field.name)

    if (property == null) {
      context.diagnostics.push(diagnostic('CCJS_MISSING_FIELD', `missing field ${field.name}`, statement.loc))
      continue
    }

    const value = emitCValueExpression(property.value, context)
    lines.push(...value.lines)
    lines.push(emitStatusCheck(`ccjs_object_init_known(${statement.name}, ${index}, ${value.expression})`, context))
  }

  return lines
}

function emitNullableRuntimeValueVariableDeclaration(statement, context) {
  const valueType = statement.valueType
  const expectedTag = cRuntimeValueTag(valueType)

  registerOwnedValue(context, statement.name)
  context.variables.set(statement.name, valueType)
  context.nullableVariables.add(statement.name)

  if (valueType === 'object') {
    registerObjectShape(context, statement.name, statement.shape)
  } else if (valueType === 'array') {
    context.runtimeArrayElementTypes.set(statement.name, statement.arrayElementType ?? 'unknown')
  } else if (valueType === 'map') {
    context.mapTypes.set(statement.name, {
      key: statement.mapKeyType ?? 'unknown',
      value: statement.mapValueType ?? 'unknown'
    })
  } else if (valueType === 'set') {
    context.setElementTypes.set(statement.name, statement.setElementType ?? 'unknown')
  } else if (valueType === 'function') {
    context.functionTypes.set(statement.name, normalizeFunctionType(statement.functionType))
    context.runtimeCallbacks.add(statement.name)
  }

  if (statement.init == null || statement.init.type === 'NullLiteral') {
    return [
      ...emitPrepareOwnedValueWrite(statement.name),
      `${statement.name} = ccjs_null_value();`
    ]
  }

  const value = isNullableScalarType(valueType)
    ? emitNullableScalarValueExpression(statement.init, context)
    : valueType === 'function'
      ? emitNullableFunctionValueExpression(statement.init, statement.functionType, context)
    : statement.init.type === 'ObjectLiteral'
      ? emitCObjectLiteralValueExpression(statement.init, context, statement.shape)
      : emitCValueExpression(statement.init, context)

  return [
    ...value.lines,
    ...emitPrepareOwnedValueWrite(statement.name),
    `${statement.name} = ${value.expression};`,
    ...emitRuntimeNullableValueCheck(statement.name, expectedTag, context),
    `ccjs_retain(${statement.name});`
  ]
}

function emitVariableDeclaration(statement, context) {
  if (statement.nullable === true && isRuntimeNullableType(statement.valueType)) {
    return emitNullableRuntimeValueVariableDeclaration(statement, context).join('\n')
  }

  if (isErrorConstructorExpression(statement.init)) {
    return emitErrorObjectVariableDeclaration(statement, context).join('\n')
  }

  const inferred = inferExpressionType(statement.init, context)
  context.variables.set(statement.name, inferred)

  if (inferred === 'string') {
    if (context.boxedMutableCaptureDeclarations.has(statement)) {
      return emitBoxedRuntimeValueVariableDeclaration(statement, statement.init, context)
    }

    const runtimeString = resolveRuntimeStringReference(statement.init, context)

    if (runtimeString != null) {
      context.runtimeStrings.add(statement.name)
      return `${statement.kind === 'const' ? 'const ' : ''}ccjs_string* ${statement.name} = ${runtimeString}`
    }

    if (isRuntimeProducedStringExpression(statement.init, context)) {
      context.diagnostics.push(diagnostic('CCJS_C_STRING_EXPR', 'runtime string declarations need prepared statement lowering in the current C backend slice', statement.loc))
      return `char* ${statement.name} = ""`
    }

    return `${statement.kind === 'const' ? 'const ' : ''}char* ${statement.name} = ${emitStringExpression(statement.init, context)}`
  }

  if (inferred === 'function') {
    context.variables.set(statement.name, 'function')
    context.functionTypes.set(statement.name, statement.functionType)

    if (isRuntimeFunctionType(statement.functionType) || isRuntimeArrowCallbackExpression(statement.init, context)) {
      context.diagnostics.push(diagnostic('CCJS_C_FUNCTION_VALUE', 'runtime callback declarations need prepared statement lowering in the current C backend slice', statement.loc))
      return `ccjs_value ${statement.name} = ccjs_undefined_value()`
    }

    return emitFunctionPointerVariable(statement.name, statement.init, context, statement.kind === 'const', statement.functionType, statement.loc)
  }

  if (!['number', 'boolean'].includes(inferred)) {
    context.diagnostics.push(diagnostic(cUnsupportedExpressionCode(inferred), 'this expression is not supported by the current C backend slice', statement.loc))
    return `double ${statement.name} = 0`
  }

  return `${statement.kind === 'const' ? 'const ' : ''}double ${statement.name} = ${emitNumberExpression(statement.init, context)}`
}

function emitScalarVariableDeclaration(statement, context) {
  if (statement.nullable === true && isRuntimeNullableType(statement.valueType)) {
    return emitNullableRuntimeValueVariableDeclaration(statement, context)
  }

  if (isErrorConstructorExpression(statement.init)) {
    return emitErrorObjectVariableDeclaration(statement, context)
  }

  const inferred = inferExpressionType(statement.init, context)
  context.variables.set(statement.name, inferred)

  if (inferred === 'string') {
    if (context.boxedMutableCaptureDeclarations.has(statement)) {
      return emitBoxedRuntimeValueVariableDeclaration(statement, statement.init, context)
    }

    const runtimeString = resolveRuntimeStringReference(statement.init, context)

    if (runtimeString != null) {
      context.runtimeStrings.add(statement.name)
      return [`${statement.kind === 'const' ? 'const ' : ''}ccjs_string* ${statement.name} = ${runtimeString};`]
    }

    const runtimeElement = resolveRuntimeArrayIndex(statement.init, context)

    if (isRuntimeProducedStringExpression(statement.init, context) || runtimeElement?.valueType === 'string') {
      return emitRuntimeStringVariableDeclaration(statement, statement.init, context)
    }

    return [`${statement.kind === 'const' ? 'const ' : ''}char* ${statement.name} = ${emitStringExpression(statement.init, context)};`]
  }

  if (inferred === 'function') {
    const runtimeFunctionType = isRuntimeArrowCallbackExpression(statement.init, context)
      ? normalizeFunctionType(statement.functionType)
      : null

    context.variables.set(statement.name, 'function')
    context.functionTypes.set(statement.name, runtimeFunctionType ?? statement.functionType)

    if (isRuntimeFunctionType(statement.functionType) || runtimeFunctionType != null) {
      return emitRuntimeCallbackVariableDeclaration(statement, context)
    }

    return [`${emitFunctionPointerVariable(statement.name, statement.init, context, statement.kind === 'const', statement.functionType, statement.loc)};`]
  }

  if (isArrayMethodCall(statement.init)) {
    context.diagnostics.push(diagnostic('CCJS_C_ARRAY_METHOD', 'array methods are not supported by the current C backend slice', statement.loc))
    return [`double ${statement.name} = 0;`]
  }

  if ((inferred === 'number' || inferred === 'boolean') && context.boxedMutableCaptureDeclarations.has(statement)) {
    return emitBoxedScalarVariableDeclaration(statement, context)
  }

  if (!['number', 'boolean'].includes(inferred)) {
    context.diagnostics.push(diagnostic(cUnsupportedExpressionCode(inferred), 'this expression is not supported by the current C backend slice', statement.loc))
    return [`double ${statement.name} = 0;`]
  }

  const value = emitPreparedNumberExpression(statement.init, context)

  return [
    ...value.lines,
    `${statement.kind === 'const' ? 'const ' : ''}double ${statement.name} = ${value.expression};`
  ]
}

function emitBoxedScalarVariableDeclaration(statement, context) {
  const value = emitPreparedNumberExpression(statement.init, context)
  const inferred = inferExpressionType(statement.init, context)

  registerBoxedValue(context, statement.name, inferred)
  context.boxedVariables.add(statement.name)

  return [
    ...value.lines,
    `${statement.name} = ccjs_default_alloc(0, sizeof(double), _Alignof(double));`,
    `if (${statement.name} == 0) ${emitFailureStatement(context)}`,
    `*${statement.name} = ${value.expression};`
  ]
}

function emitBoxedRuntimeValueVariableDeclaration(statement, expression, context) {
  const valueType = inferExpressionType(expression, context)
  const value = emitCValueExpression(expression, context)
  const tag = valueType === 'string' ? 'CCJS_TAG_STRING' : 'CCJS_TAG_OBJECT'

  registerBoxedValue(context, statement.name, valueType)
  context.boxedVariables.add(statement.name)
  context.variables.set(statement.name, valueType)

  return [
    ...value.lines,
    `${statement.name} = ccjs_default_alloc(0, sizeof(ccjs_value), _Alignof(ccjs_value));`,
    `if (${statement.name} == 0) ${emitFailureStatement(context)}`,
    `*${statement.name} = ${value.expression};`,
    emitRuntimeTypeCheck(`(*${statement.name}).tag != ${tag} || (*${statement.name}).as.ref == 0`, context),
    `ccjs_retain(*${statement.name});`
  ]
}

function isBoxedRuntimeValueAssignment(expression, context) {
  return expression.target?.type === 'Reference'
    && expression.target.path.length === 1
    && isBoxedRuntimeValueName(expression.target.path[0], context)
}

function isNullableRuntimeValueAssignment(expression, context) {
  return expression.target?.type === 'Reference'
    && expression.target.path.length === 1
    && context.nullableVariables.has(expression.target.path[0])
}

function emitNullableRuntimeValueAssignment(expression, context) {
  const name = expression.target.path[0]
  const expectedTag = cRuntimeValueTag(context.variables.get(name))
  const targetType = context.variables.get(name)
  const value = isNullableScalarType(targetType)
    ? emitNullableScalarValueExpression(expression.value, context)
    : targetType === 'function'
      ? emitNullableFunctionValueExpression(expression.value, context.functionTypes.get(name), context)
    : expression.value.type === 'ObjectLiteral'
      ? emitCObjectLiteralValueExpression(expression.value, context, context.objectShapes.get(name) == null
          ? null
          : {
              fields: context.objectShapes.get(name)
            })
      : emitCValueExpression(expression.value, context)
  const temp = nextCName(context, 'ccjs_nullable_value')

  return [
    ...value.lines,
    `ccjs_value ${temp} = ${value.expression};`,
    ...emitRuntimeNullableValueCheck(temp, expectedTag, context),
    `ccjs_retain(${temp});`,
    `ccjs_release(${name});`,
    `${name} = ${temp};`,
    ...clearNullableScalarNarrowing(name, context)
  ]
}

function emitBoxedRuntimeValueAssignment(expression, context) {
  const name = expression.target.path[0]
  const expected = context.variables.get(name)
  const value = emitCValueExpression(expression.value, context)
  const temp = nextCName(context, 'ccjs_box_value')
  const tag = expected === 'string' ? 'CCJS_TAG_STRING' : 'CCJS_TAG_OBJECT'

  return [
    ...value.lines,
    `ccjs_value ${temp} = ${value.expression};`,
    emitRuntimeTypeCheck(`${temp}.tag != ${tag} || ${temp}.as.ref == 0`, context),
    `ccjs_retain(${temp});`,
    `ccjs_release(*${name});`,
    `*${name} = ${temp};`
  ]
}

function emitRuntimeNullableValueCheck(name, expectedTag, context) {
  if (expectedTag == null) {
    return []
  }

  if (expectedTag === 'CCJS_TAG_BOOL' || expectedTag === 'CCJS_TAG_NUMBER') {
    return [
      emitRuntimeTypeCheck(`${name}.tag != CCJS_TAG_NULL && ${name}.tag != ${expectedTag}`, context)
    ]
  }

  return [
    emitRuntimeTypeCheck(`${name}.tag != CCJS_TAG_NULL && (${name}.tag != ${expectedTag} || ${name}.as.ref == 0)`, context)
  ]
}

function emitRuntimeValueCheck(name, expectedTag, context) {
  if (expectedTag == null) {
    return ''
  }

  if (expectedTag === 'CCJS_TAG_BOOL' || expectedTag === 'CCJS_TAG_NUMBER') {
    return emitRuntimeTypeCheck(`${name}.tag != ${expectedTag}`, context)
  }

  return emitRuntimeTypeCheck(`${name}.tag != ${expectedTag} || ${name}.as.ref == 0`, context)
}

function cRuntimeValueTag(valueType) {
  if (valueType === 'boolean') {
    return 'CCJS_TAG_BOOL'
  }

  if (valueType === 'number') {
    return 'CCJS_TAG_NUMBER'
  }

  if (valueType === 'string') {
    return 'CCJS_TAG_STRING'
  }

  if (valueType === 'object') {
    return 'CCJS_TAG_OBJECT'
  }

  if (valueType === 'array') {
    return 'CCJS_TAG_ARRAY'
  }

  if (valueType === 'function') {
    return 'CCJS_TAG_FUNCTION'
  }

  if (valueType === 'map') {
    return 'CCJS_TAG_MAP'
  }

  if (valueType === 'set') {
    return 'CCJS_TAG_SET'
  }

  return null
}

function isRuntimeNullableType(valueType) {
  return cRuntimeValueTag(valueType) != null
}

function isNullableScalarType(valueType) {
  return valueType === 'number' || valueType === 'boolean'
}

function isNullableScalarParam(param) {
  return param?.nullable === true && isNullableScalarType(param.valueType)
}

function isNullableScalarRuntimeExpression(expression, context) {
  return isNullableScalarType(inferExpressionType(expression, context)) && isNullableRuntimeExpression(expression, context)
}

function isBoxedRuntimeValueName(name, context) {
  return context.boxedVariables.has(name) && isRuntimeBoxedValueType(context.variables.get(name))
}

function isBoxedRuntimeStringName(name, context) {
  return context.boxedVariables.has(name) && context.variables.get(name) === 'string'
}

function isBoxedRuntimeStringReference(expression, context) {
  return expression?.type === 'Reference'
    && expression.path.length === 1
    && isBoxedRuntimeStringName(expression.path[0], context)
}

function emitBoxedObjectVariableDeclaration(statement, context) {
  const shapeName = nextCName(context, `ccjs_shape_${statement.name}`)
  const fieldsName = `${shapeName}_fields`
  const fields = statement.shape?.fields ?? statement.init.properties.map(property => ({
    name: property.key,
    readonly: false,
    valueType: inferExpressionType(property.value, context)
  }))
  const properties = new Map<string, AnyNode>(statement.init.properties.map(property => [property.key, property]))
  const lines = [
    `static const ccjs_field_info ${fieldsName}[] = {`
  ]

  for (const field of fields) {
    lines.push(`  { ${cStringLiteral(field.name)}, ${field.readonly ? 'CCJS_FIELD_READONLY' : '0'} },`)
  }

  lines.push('};')
  lines.push(`static const ccjs_shape ${shapeName} = {`)
  lines.push(`  ${fields.length},`)
  lines.push(`  ${fieldsName}`)
  lines.push('};')
  registerBoxedValue(context, statement.name, 'object')
  context.boxedVariables.add(statement.name)
  context.variables.set(statement.name, 'object')
  context.objectShapes.set(statement.name, fields.map(field => ({
    name: field.name,
    valueType: field.valueType,
    arrayElementType: field.arrayElementType,
    mapKeyType: field.mapKeyType,
    mapValueType: field.mapValueType,
    setElementType: field.setElementType
  })))
  lines.push(`${statement.name} = ccjs_default_alloc(0, sizeof(ccjs_value), _Alignof(ccjs_value));`)
  lines.push(`if (${statement.name} == 0) ${emitFailureStatement(context)}`)
  lines.push(`*${statement.name} = ccjs_undefined_value();`)
  lines.push(emitStatusCheck(`ccjs_object_new(&ccjs_default_allocator, &${shapeName}, ${statement.name})`, context))

  for (const [index, field] of fields.entries()) {
    const property = properties.get(field.name)

    if (property == null) {
      context.diagnostics.push(diagnostic('CCJS_MISSING_FIELD', `missing field ${field.name}`, statement.loc))
      continue
    }

    const value = emitCValueExpression(property.value, context)
    lines.push(...value.lines)
    lines.push(emitStatusCheck(`ccjs_object_init_known(*${statement.name}, ${index}, ${value.expression})`, context))
  }

  return lines
}

function emitKnownObjectMemberVariableDeclaration(statement, member, context) {
  return emitObjectMemberVariableDeclaration(statement, member, context, temp => `ccjs_object_get_known(${emitObjectValueReference(member.objectName, context)}, ${member.index}, &${temp})`)
}

function emitDynamicObjectMemberVariableDeclaration(statement, member, context) {
  return emitObjectMemberVariableDeclaration(statement, member, context, temp => `ccjs_object_get(${emitObjectValueReference(member.objectName, context)}, ${cStringLiteral(member.key)}, ${utf8ByteLength(member.key)}, &${temp})`)
}

function emitObjectMemberVariableDeclaration(statement, member, context, emitGetCall) {
  if (member.valueType === 'array') {
    return emitObjectArrayMemberVariableDeclaration(statement, member, context, emitGetCall)
  }

  if (member.valueType === 'map' || member.valueType === 'set') {
    return emitObjectCollectionMemberVariableDeclaration(statement, member, context, emitGetCall)
  }

  if (member.valueType === 'string') {
    return emitObjectStringMemberVariableDeclaration(statement, member, context, emitGetCall)
  }

  if (!['number', 'boolean'].includes(member.valueType)) {
    context.diagnostics.push(diagnostic('CCJS_C_UNSUPPORTED_EXPR', 'this object field type is not supported by the current C backend slice', statement.loc))
    return [`double ${statement.name} = 0;`]
  }

  const temp = nextCName(context, 'ccjs_field')
  registerOwnedValue(context, temp)
  const lines = [
    ...emitPrepareOwnedValueWrite(temp),
    emitStatusCheck(emitGetCall(temp), context),
    `${statement.kind === 'const' ? 'const ' : ''}double ${statement.name} = ${member.valueType === 'boolean' ? `${temp}.as.boolean ? 1 : 0` : `${temp}.as.number`};`
  ]

  context.variables.set(statement.name, member.valueType)

  return lines
}

function emitObjectArrayMemberVariableDeclaration(statement, member, context, emitGetCall) {
  registerOwnedValue(context, statement.name)

  const lines = [
    ...emitPrepareOwnedValueWrite(statement.name),
    emitStatusCheck(emitGetCall(statement.name), context),
    emitRuntimeTypeCheck(`${statement.name}.tag != CCJS_TAG_ARRAY || ${statement.name}.as.ref == 0`, context)
  ]

  context.variables.set(statement.name, 'array')
  context.runtimeArrayElementTypes.set(statement.name, member.arrayElementType ?? 'unknown')

  return lines
}

function emitObjectCollectionMemberVariableDeclaration(statement, member, context, emitGetCall) {
  registerOwnedValue(context, statement.name)

  const tag = member.valueType === 'map' ? 'CCJS_TAG_MAP' : 'CCJS_TAG_SET'
  const lines = [
    ...emitPrepareOwnedValueWrite(statement.name),
    emitStatusCheck(emitGetCall(statement.name), context),
    emitRuntimeTypeCheck(`${statement.name}.tag != ${tag} || ${statement.name}.as.ref == 0`, context)
  ]

  context.variables.set(statement.name, member.valueType)

  if (member.valueType === 'map') {
    context.mapTypes.set(statement.name, {
      key: member.mapKeyType ?? 'unknown',
      value: member.mapValueType ?? 'unknown'
    })
  } else {
    context.setElementTypes.set(statement.name, member.setElementType ?? 'unknown')
  }

  return lines
}

function emitObjectStringMemberVariableDeclaration(statement, member, context, emitGetCall) {
  const temp = nextCName(context, 'ccjs_field')
  registerOwnedValue(context, temp)
  const lines = [
    ...emitPrepareOwnedValueWrite(temp),
    emitStatusCheck(emitGetCall(temp), context),
    emitRuntimeTypeCheck(`${temp}.tag != CCJS_TAG_STRING || ${temp}.as.ref == 0`, context),
    `${statement.kind === 'const' ? 'const ' : ''}ccjs_string* ${statement.name} = (ccjs_string*)${temp}.as.ref;`
  ]

  context.variables.set(statement.name, 'string')
  context.runtimeStrings.add(statement.name)

  return lines
}

function emitKnownObjectMemberAssignment(expression, member, context) {
  const value = emitCValueExpression(expression.value, context)
  const valueType = inferExpressionType(expression.value, context)

  updateKnownObjectMemberValueType(member, valueType, context)

  return [
    ...value.lines,
    emitStatusCheck(`ccjs_object_set_known(${emitObjectValueReference(member.objectName, context)}, ${member.index}, ${value.expression})`, context)
  ]
}

function emitDynamicObjectMemberAssignment(expression, member, context) {
  const value = emitCValueExpression(expression.value, context)
  const valueType = inferExpressionType(expression.value, context)

  updateKnownObjectMemberValueType(member, valueType, context)

  return [
    ...value.lines,
    emitStatusCheck(`ccjs_object_set(${emitObjectValueReference(member.objectName, context)}, ${cStringLiteral(member.key)}, ${utf8ByteLength(member.key)}, ${value.expression})`, context)
  ]
}

function emitKnownArrayIndexVariableDeclaration(statement, element, context) {
  if (element.valueType === 'string') {
    return emitKnownArrayStringIndexVariableDeclaration(statement, element, context)
  }

  if (!['number', 'boolean'].includes(element.valueType)) {
    context.diagnostics.push(diagnostic('CCJS_C_UNSUPPORTED_EXPR', 'this array element type is not supported by the current C backend slice', statement.loc))
    return [`double ${statement.name} = 0;`]
  }

  const temp = nextCName(context, 'ccjs_item')
  registerOwnedValue(context, temp)
  const lines = [
    ...emitPrepareOwnedValueWrite(temp),
    emitStatusCheck(`ccjs_array_get(${element.arrayName}, ${element.index}, &${temp})`, context),
    `${statement.kind === 'const' ? 'const ' : ''}double ${statement.name} = ${element.valueType === 'boolean' ? `${temp}.as.boolean ? 1 : 0` : `${temp}.as.number`};`
  ]

  context.variables.set(statement.name, element.valueType)

  return lines
}

function emitKnownArrayStringIndexVariableDeclaration(statement, element, context) {
  const temp = nextCName(context, 'ccjs_item')
  registerOwnedValue(context, temp)
  const lines = [
    ...emitPrepareOwnedValueWrite(temp),
    emitStatusCheck(`ccjs_array_get(${element.arrayName}, ${element.index}, &${temp})`, context),
    emitRuntimeTypeCheck(`${temp}.tag != CCJS_TAG_STRING || ${temp}.as.ref == 0`, context),
    `${statement.kind === 'const' ? 'const ' : ''}ccjs_string* ${statement.name} = (ccjs_string*)${temp}.as.ref;`
  ]

  context.variables.set(statement.name, 'string')
  context.runtimeStrings.add(statement.name)

  return lines
}

function emitKnownArrayIndexAssignment(expression, element, context) {
  const value = emitCValueExpression(expression.value, context)
  const valueType = inferExpressionType(expression.value, context)

  updateKnownArrayElementValueType(element, valueType, context)

  return [
    ...value.lines,
    emitStatusCheck(`ccjs_array_set(${element.arrayName}, ${element.index}, ${value.expression})`, context)
  ]
}

function emitArrayVariableDeclaration(statement, context) {
  const lines = [
    ...emitPrepareOwnedValueWrite(statement.name),
    emitStatusCheck(`ccjs_array_new(&ccjs_default_allocator, ${statement.init.elements.length}, &${statement.name})`, context)
  ]

  registerOwnedValue(context, statement.name)
  context.variables.set(statement.name, 'array')
  context.arrayShapes.set(statement.name, statement.init.elements.map(element => ({
    valueType: inferExpressionType(element, context)
  })))

  for (const [index, element] of statement.init.elements.entries()) {
    const value = emitCValueExpression(element, context)
    lines.push(...value.lines)
    lines.push(emitStatusCheck(`ccjs_array_set(${statement.name}, ${index}, ${value.expression})`, context))
  }

  return lines
}

function emitCValueExpression(expression, context) {
  if (isNullishCoalescingExpression(expression)) {
    return emitCNullishCoalescingValueExpression(expression, context)
  }

  if (isErrorConstructorExpression(expression)) {
    return emitCErrorObjectValueExpression(expression, context)
  }

  if (expression?.type === 'OptionalCallExpression' && isNullableRuntimeExpression(expression, context)) {
    return emitOptionalRuntimeCallbackCallValueExpression(expression, context)
  }

  if (isNullableScalarRuntimeExpression(expression, context)) {
    return emitPreparedNullableScalarRuntimeValueExpression(expression, context)
  }

  if (isStringConversionCall(expression, context)) {
    return emitCStringConversionValueExpression(expression, context)
  }

  if (isStringTrimCall(expression, context)) {
    return emitCStringTrimValueExpression(expression, context)
  }

  if (isStringSliceCall(expression, context)) {
    return emitCStringSliceValueExpression(expression, context)
  }

  if (isStringConcatExpression(expression, context)) {
    return emitCStringConcatValueExpression(expression, context)
  }

  if (expression?.type === 'ArrayLiteral') {
    return emitCArrayLiteralValueExpression(expression, context)
  }

  if (expression?.type === 'ObjectLiteral') {
    return emitCObjectLiteralValueExpression(expression, context)
  }

  if (expression?.type === 'StringLiteral') {
    const temp = nextCName(context, 'ccjs_value')
    registerOwnedValue(context, temp)

    return {
      lines: [
        ...emitPrepareOwnedValueWrite(temp),
        emitStatusCheck(`ccjs_string_from_literal(&ccjs_default_allocator, ${cStringLiteral(expression.value)}, ${utf8ByteLength(expression.value)}, &${temp})`, context)
      ],
      expression: temp
    }
  }

  if (expression?.type === 'NumberLiteral') {
    return {
      lines: [],
      expression: `ccjs_number_value(${expression.value})`
    }
  }

  if (expression?.type === 'BooleanLiteral') {
    return {
      lines: [],
      expression: `ccjs_bool_value(${expression.value ? 'true' : 'false'})`
    }
  }

  if (expression?.type === 'NullLiteral') {
    return {
      lines: [],
      expression: 'ccjs_null_value()'
    }
  }

  if (expression?.type === 'Reference') {
    const name = expression.path.join('_')
    const type = context.variables.get(name)

    if (context.nullableVariables.has(name)) {
      return {
        lines: [],
        expression: name
      }
    }

    if (isBoxedRuntimeValueName(name, context)) {
      const tag = type === 'string' ? 'CCJS_TAG_STRING' : 'CCJS_TAG_OBJECT'

      return {
        lines: [
          emitRuntimeTypeCheck(`(*${name}).tag != ${tag} || (*${name}).as.ref == 0`, context)
        ],
        expression: `(*${name})`
      }
    }

    if (type === 'string' && context.runtimeStrings.has(name)) {
      const temp = nextCName(context, 'ccjs_value')

      return {
        lines: [
          `ccjs_value ${temp};`,
          `${temp}.tag = CCJS_TAG_STRING;`,
          `${temp}.as.ref = (ccjs_ref*)&${name}->header;`
        ],
        expression: temp
      }
    }

    if (type === 'object' || type === 'array') {
      return {
        lines: [],
        expression: name
      }
    }

    if (type === 'map' || type === 'set') {
      return {
        lines: [],
        expression: name
      }
    }

    if (type === 'number') {
      return {
        lines: [],
        expression: `ccjs_number_value(${name})`
      }
    }

    if (type === 'boolean') {
      return {
        lines: [],
        expression: `ccjs_bool_value(${name})`
      }
    }
  }

  if (expression?.type === 'OptionalMemberExpression') {
    return emitCOptionalMemberValueExpression(expression, context)
  }

  if (expression?.type === 'OptionalIndexExpression') {
    return emitCOptionalIndexValueExpression(expression, context)
  }

  if (isMemberAccessExpression(expression)) {
    const member = resolveKnownObjectMember(expression, context)

    if (member?.valueType === 'array') {
      const temp = nextCName(context, 'ccjs_value')
      registerOwnedValue(context, temp)

      return {
        lines: [
          ...emitPrepareOwnedValueWrite(temp),
          emitStatusCheck(`ccjs_object_get_known(${emitObjectValueReference(member.objectName, context)}, ${member.index}, &${temp})`, context),
          emitRuntimeTypeCheck(`${temp}.tag != CCJS_TAG_ARRAY || ${temp}.as.ref == 0`, context)
        ],
        expression: temp
      }
    }

    if (member?.valueType === 'string') {
      const temp = nextCName(context, 'ccjs_value')
      registerOwnedValue(context, temp)

      return {
        lines: [
          ...emitPrepareOwnedValueWrite(temp),
          emitStatusCheck(`ccjs_object_get_known(${emitObjectValueReference(member.objectName, context)}, ${member.index}, &${temp})`, context),
          emitRuntimeTypeCheck(`${temp}.tag != CCJS_TAG_STRING || ${temp}.as.ref == 0`, context)
        ],
        expression: temp
      }
    }
  }

  if (isIndexAccessExpression(expression)) {
    const element = resolveKnownArrayIndex(expression, context)

    if (element?.valueType === 'array') {
      const temp = nextCName(context, 'ccjs_value')
      registerOwnedValue(context, temp)

      return {
        lines: [
          ...emitPrepareOwnedValueWrite(temp),
          emitStatusCheck(`ccjs_array_get(${element.arrayName}, ${element.index}, &${temp})`, context),
          emitRuntimeTypeCheck(`${temp}.tag != CCJS_TAG_ARRAY || ${temp}.as.ref == 0`, context)
        ],
        expression: temp
      }
    }

    const runtimeElement = resolveRuntimeArrayIndex(expression, context)

    if (runtimeElement != null && ['boolean', 'number', 'string'].includes(runtimeElement.valueType)) {
      const value = emitPreparedRuntimeArrayIndexValue(expression, runtimeElement, context, 'ccjs_value')

      return runtimeElement.valueType === 'string'
        ? {
            lines: [
              ...value.lines,
              emitRuntimeTypeCheck(`${value.expression}.tag != CCJS_TAG_STRING || ${value.expression}.as.ref == 0`, context)
            ],
            expression: value.expression
          }
        : value
    }

    if (element?.valueType === 'string') {
      const temp = nextCName(context, 'ccjs_value')
      registerOwnedValue(context, temp)

      return {
        lines: [
          ...emitPrepareOwnedValueWrite(temp),
          emitStatusCheck(`ccjs_array_get(${element.arrayName}, ${element.index}, &${temp})`, context),
          emitRuntimeTypeCheck(`${temp}.tag != CCJS_TAG_STRING || ${temp}.as.ref == 0`, context)
        ],
        expression: temp
      }
    }

    const field = resolveKnownObjectIndex(expression, context)

    if (field?.valueType === 'array') {
      const temp = nextCName(context, 'ccjs_value')
      registerOwnedValue(context, temp)

      return {
        lines: [
          ...emitPrepareOwnedValueWrite(temp),
          emitStatusCheck(`ccjs_object_get(${emitObjectValueReference(field.objectName, context)}, ${cStringLiteral(field.key)}, ${utf8ByteLength(field.key)}, &${temp})`, context),
          emitRuntimeTypeCheck(`${temp}.tag != CCJS_TAG_ARRAY || ${temp}.as.ref == 0`, context)
        ],
        expression: temp
      }
    }

    if (field?.valueType === 'string') {
      const temp = nextCName(context, 'ccjs_value')
      registerOwnedValue(context, temp)

      return {
        lines: [
          ...emitPrepareOwnedValueWrite(temp),
          emitStatusCheck(`ccjs_object_get(${emitObjectValueReference(field.objectName, context)}, ${cStringLiteral(field.key)}, ${utf8ByteLength(field.key)}, &${temp})`, context),
          emitRuntimeTypeCheck(`${temp}.tag != CCJS_TAG_STRING || ${temp}.as.ref == 0`, context)
        ],
        expression: temp
      }
    }
  }

  if (expression?.type === 'CallExpression' && inferExpressionType(expression, context) === 'string') {
    const collectionCall = emitPreparedCollectionCallExpression(expression, context)

    if (collectionCall != null) {
      return collectionCall
    }

    const temp = nextCName(context, 'ccjs_value')
    registerOwnedValue(context, temp)
    const call = emitPreparedCallExpression(expression, context)

    return {
      lines: [
        ...call.lines,
        ...emitPrepareOwnedValueWrite(temp),
        `${temp} = ${call.expression};`,
        emitRuntimeTypeCheck(`${temp}.tag != CCJS_TAG_STRING || ${temp}.as.ref == 0`, context)
      ],
      expression: temp
    }
  }

  if (expression?.type === 'CallExpression' && inferExpressionType(expression, context) === 'object') {
    const temp = nextCName(context, 'ccjs_value')
    registerOwnedValue(context, temp)
    const call = emitPreparedCallExpression(expression, context)

    return {
      lines: [
        ...call.lines,
        ...emitPrepareOwnedValueWrite(temp),
        `${temp} = ${call.expression};`,
        emitRuntimeTypeCheck(`${temp}.tag != CCJS_TAG_OBJECT || ${temp}.as.ref == 0`, context)
      ],
      expression: temp
    }
  }

  context.diagnostics.push(diagnostic('CCJS_C_UNSUPPORTED_EXPR', 'this object field expression is not supported by the current C backend slice', expression?.loc))

  return {
    lines: [],
    expression: 'ccjs_undefined_value()'
  }
}

function emitNullableScalarValueExpression(expression, context) {
  if (expression?.type === 'NullLiteral') {
    return {
      lines: [],
      expression: 'ccjs_null_value()'
    }
  }

  if (isNullableScalarRuntimeExpression(expression, context)) {
    return emitPreparedNullableScalarRuntimeValueExpression(expression, context)
  }

  const valueType = inferExpressionType(expression, context)

  if (!isNullableScalarType(valueType)) {
    context.diagnostics.push(diagnostic('CCJS_C_NULLISH', 'nullable scalar values currently support only number, boolean and null values in C', expression?.loc))

    return {
      lines: [],
      expression: 'ccjs_null_value()'
    }
  }

  const value = emitPreparedNumberExpression(expression, context)

  return {
    lines: value.lines,
    expression: valueType === 'boolean'
      ? `ccjs_bool_value((${value.expression}) != 0)`
      : `ccjs_number_value(${value.expression})`
  }
}

function emitPreparedNullableScalarRuntimeValueExpression(expression, context) {
  if (expression?.type === 'Reference' && expression.path.length === 1 && context.nullableVariables.has(expression.path[0]) && isNullableScalarType(context.variables.get(expression.path[0]))) {
    return {
      lines: [],
      expression: expression.path[0]
    }
  }

  if (expression?.type === 'OptionalMemberExpression') {
    return emitCOptionalMemberValueExpression(expression, context)
  }

  if (expression?.type === 'OptionalIndexExpression') {
    return emitCOptionalIndexValueExpression(expression, context)
  }

  if (expression?.type === 'OptionalCallExpression') {
    return emitOptionalRuntimeCallbackCallValueExpression(expression, context)
  }

  if (expression?.type === 'CallExpression' && isNullableScalarRuntimeExpression(expression, context)) {
    const valueType = inferExpressionType(expression, context)
    const expectedTag = cRuntimeValueTag(valueType)
    const call = emitPreparedCallExpression(expression, context)
    const temp = nextCName(context, 'ccjs_nullable_value')
    registerOwnedValue(context, temp)

    return {
      lines: [
        ...call.lines,
        ...emitPrepareOwnedValueWrite(temp),
        `${temp} = ${call.expression};`,
        ...emitRuntimeNullableValueCheck(temp, expectedTag, context)
      ],
      expression: temp
    }
  }

  context.diagnostics.push(diagnostic('CCJS_C_NULLISH', 'this nullable scalar expression is not supported by the current C backend slice', expression?.loc))

  return {
    lines: [],
    expression: 'ccjs_null_value()'
  }
}

function emitNullableFunctionValueExpression(expression, functionType, context) {
  if (expression?.type === 'NullLiteral') {
    return {
      lines: [],
      expression: 'ccjs_null_value()'
    }
  }

  if (expression?.type === 'Reference' && expression.path.length === 1 && context.nullableVariables.has(expression.path[0]) && context.variables.get(expression.path[0]) === 'function') {
    return {
      lines: [],
      expression: expression.path[0]
    }
  }

  return emitRuntimeCallbackValue(expression, normalizeFunctionType(functionType), context)
}

function emitCArrayLiteralValueExpression(expression, context) {
  const temp = nextCName(context, 'ccjs_array')
  registerOwnedValue(context, temp)
  const lines = [
    ...emitPrepareOwnedValueWrite(temp),
    emitStatusCheck(`ccjs_array_new(&ccjs_default_allocator, ${expression.elements.length}, &${temp})`, context)
  ]

  for (const [index, element] of expression.elements.entries()) {
    const value = emitCValueExpression(element, context)
    lines.push(...value.lines)
    lines.push(emitStatusCheck(`ccjs_array_set(${temp}, ${index}, ${value.expression})`, context))
  }

  return {
    lines,
    expression: temp
  }
}

function emitCObjectLiteralValueExpression(expression, context, shape: AnyNode | null = null) {
  const temp = nextCName(context, 'ccjs_object')
  const shapeName = nextCName(context, 'ccjs_shape_value')
  const fieldsName = `${shapeName}_fields`
  const fields = shape?.fields ?? expression.properties.map(property => ({
    name: property.key,
    readonly: false,
    valueType: inferExpressionType(property.value, context)
  }))
  const properties = new Map<string, AnyNode>(expression.properties.map(property => [property.key, property]))
  const lines = [
    `static const ccjs_field_info ${fieldsName}[] = {`
  ]

  for (const field of fields) {
    lines.push(`  { ${cStringLiteral(field.name)}, ${field.readonly ? 'CCJS_FIELD_READONLY' : '0'} },`)
  }

  lines.push('};')
  lines.push(`static const ccjs_shape ${shapeName} = {`)
  lines.push(`  ${fields.length},`)
  lines.push(`  ${fieldsName}`)
  lines.push('};')
  registerOwnedValue(context, temp)
  lines.push(...emitPrepareOwnedValueWrite(temp))
  lines.push(emitStatusCheck(`ccjs_object_new(&ccjs_default_allocator, &${shapeName}, &${temp})`, context))

  for (const [index, field] of fields.entries()) {
    const property = properties.get(field.name)

    if (property == null) {
      context.diagnostics.push(diagnostic('CCJS_MISSING_FIELD', `missing field ${field.name}`, expression.loc))
      continue
    }

    const value = emitCValueExpression(property.value, context)
    lines.push(...value.lines)
    lines.push(emitStatusCheck(`ccjs_object_init_known(${temp}, ${index}, ${value.expression})`, context))
  }

  return {
    lines,
    expression: temp
  }
}

function emitErrorObjectVariableDeclaration(statement, context) {
  registerOwnedValue(context, statement.name)
  context.variables.set(statement.name, 'object')
  registerErrorObjectShape(context, statement.name)

  return emitCErrorObjectInitLines(statement.name, statement.init, context)
}

function emitCErrorObjectValueExpression(expression, context) {
  const temp = nextCName(context, 'ccjs_error_object')
  registerOwnedValue(context, temp)

  return {
    lines: emitCErrorObjectInitLines(temp, expression, context),
    expression: temp
  }
}

function emitCErrorObjectInitLines(target, expression, context) {
  const shapeName = nextCName(context, 'ccjs_shape_error')
  const fieldsName = `${shapeName}_fields`
  const name = emitCValueExpression(cStringLiteralNode('Error', expression.loc), context)
  const message = emitCValueExpression(errorMessageExpression(expression, context), context)

  return [
    `static const ccjs_field_info ${fieldsName}[] = {`,
    `  { ${cStringLiteral('name')}, CCJS_FIELD_READONLY },`,
    `  { ${cStringLiteral('message')}, CCJS_FIELD_READONLY },`,
    '};',
    `static const ccjs_shape ${shapeName} = {`,
    '  2,',
    `  ${fieldsName}`,
    '};',
    ...emitPrepareOwnedValueWrite(target),
    emitStatusCheck(`ccjs_object_new(&ccjs_default_allocator, &${shapeName}, &${target})`, context),
    ...name.lines,
    emitStatusCheck(`ccjs_object_init_known(${target}, 0, ${name.expression})`, context),
    ...message.lines,
    emitStatusCheck(`ccjs_object_init_known(${target}, 1, ${message.expression})`, context)
  ]
}

function errorMessageExpression(expression, context) {
  if (expression.args.length > 1) {
    context.diagnostics.push(diagnostic('CCJS_ARG_COUNT', `Error constructor expects at most 1 argument(s), got ${expression.args.length}`, expression.loc))
  }

  const message = expression.args[0] ?? cStringLiteralNode('', expression.loc)

  if (inferExpressionType(message, context) !== 'string') {
    context.diagnostics.push(diagnostic('CCJS_TYPE_MISMATCH', 'Error message must be a string in the current C backend slice', message.loc ?? expression.loc))

    return cStringLiteralNode('', expression.loc)
  }

  return message
}

function cStringLiteralNode(value, loc = null) {
  return {
    type: 'StringLiteral',
    value,
    loc
  }
}

function emitCOptionalMemberValueExpression(expression, context) {
  const member = resolveKnownObjectMember(expression, context)

  if (member == null || !isRuntimeNullableType(member.valueType)) {
    context.diagnostics.push(diagnostic('CCJS_C_OPTIONAL_CHAINING', 'optional member access for this field is not supported by the current C backend slice', expression.loc))

    return {
      lines: [],
      expression: 'ccjs_undefined_value()'
    }
  }

  return emitCOptionalObjectReadValueExpression(expression.object, member.valueType, context, temp => `ccjs_object_get_known(${temp}, ${member.index}, &`)
}

function emitCOptionalIndexValueExpression(expression, context) {
  const field = resolveKnownObjectIndex(expression, context)

  if (field != null) {
    if (!isRuntimeNullableType(field.valueType)) {
      context.diagnostics.push(diagnostic('CCJS_C_OPTIONAL_CHAINING', 'optional object index access for this field is not supported by the current C backend slice', expression.loc))

      return {
        lines: [],
        expression: 'ccjs_undefined_value()'
      }
    }

    return emitCOptionalObjectReadValueExpression(expression.object, field.valueType, context, temp => `ccjs_object_get(${temp}, ${cStringLiteral(field.key)}, ${utf8ByteLength(field.key)}, &`)
  }

  const element = resolveOptionalRuntimeArrayIndex(expression, context)

  if (element != null) {
    if (!isRuntimeNullableType(element.valueType)) {
      context.diagnostics.push(diagnostic('CCJS_C_OPTIONAL_CHAINING', 'optional array index access for this element type is not supported by the current C backend slice', expression.loc))

      return {
        lines: [],
        expression: 'ccjs_undefined_value()'
      }
    }

    return emitCOptionalArrayIndexValueExpression(expression.object, element, context)
  }

  context.diagnostics.push(diagnostic('CCJS_C_OPTIONAL_CHAINING', 'optional index access is not supported by the current C backend slice', expression.loc))

  return {
    lines: [],
    expression: 'ccjs_undefined_value()'
  }
}

function emitCOptionalObjectReadValueExpression(objectExpression, valueType, context, emitGetPrefix) {
  const object = emitCValueExpression(objectExpression, context)
  const temp = nextCName(context, 'ccjs_optional_value')
  const expectedTag = cRuntimeValueTag(valueType)
  registerOwnedValue(context, temp)

  return {
    lines: [
      ...object.lines,
      ...emitPrepareOwnedValueWrite(temp),
      `if (${object.expression}.tag == CCJS_TAG_NULL) {`,
      `  ${temp} = ccjs_null_value();`,
      '} else {',
      `  ${emitRuntimeTypeCheck(`${object.expression}.tag != CCJS_TAG_OBJECT || ${object.expression}.as.ref == 0`, context)}`,
      `  ${emitStatusCheck(`${emitGetPrefix(object.expression)}${temp})`, context)}`,
      ...emitRuntimeNullableValueCheck(temp, expectedTag, context).map(line => `  ${line}`),
      '}'
    ],
    expression: temp
  }
}

function emitCOptionalArrayIndexValueExpression(arrayExpression, element, context) {
  const array = emitCValueExpression(arrayExpression, context)
  const temp = nextCName(context, 'ccjs_optional_value')
  const expectedTag = cRuntimeValueTag(element.valueType)
  registerOwnedValue(context, temp)

  return {
    lines: [
      ...array.lines,
      ...emitPrepareOwnedValueWrite(temp),
      `if (${array.expression}.tag == CCJS_TAG_NULL) {`,
      `  ${temp} = ccjs_null_value();`,
      '} else {',
      `  ${emitRuntimeTypeCheck(`${array.expression}.tag != CCJS_TAG_ARRAY || ${array.expression}.as.ref == 0`, context)}`,
      `  ${emitStatusCheck(`ccjs_array_get(${array.expression}, ${element.index}, &${temp})`, context)}`,
      ...emitRuntimeNullableValueCheck(temp, expectedTag, context).map(line => `  ${line}`),
      '}'
    ],
    expression: temp
  }
}

function emitCNullishCoalescingValueExpression(expression, context) {
  if (!canLowerCNullishCoalescingExpression(expression, context)) {
    context.diagnostics.push(diagnostic('CCJS_C_NULLISH', 'nullish coalescing is not supported by the current C backend slice', expression.loc))

    return {
      lines: [],
      expression: 'ccjs_undefined_value()'
    }
  }

  const left = emitCValueExpression(expression.left, context)
  const right = emitCValueExpression(expression.right, context)
  const temp = nextCName(context, 'ccjs_value')
  const expectedTag = cRuntimeValueTag(inferExpressionType(expression, context))
  registerOwnedValue(context, temp)

  return {
    lines: [
      ...left.lines,
      ...emitPrepareOwnedValueWrite(temp),
      `if (${left.expression}.tag == CCJS_TAG_NULL) {`,
      ...right.lines.map(line => `  ${line}`),
      `  ${temp} = ${right.expression};`,
      ...emitRuntimeNullableValueCheck(temp, expectedTag, context).map(line => `  ${line}`),
      `  ccjs_retain(${temp});`,
      '} else {',
      `  ${temp} = ${left.expression};`,
      ...emitRuntimeNullableValueCheck(temp, expectedTag, context).map(line => `  ${line}`),
      `  ccjs_retain(${temp});`,
      '}'
    ],
    expression: temp
  }
}

function emitCStringConcatValueExpression(expression, context) {
  const left = emitPreparedStringBytesOperand(expression.left, context)
  const right = emitPreparedStringBytesOperand(expression.right, context)
  const temp = nextCName(context, 'ccjs_value')
  registerOwnedValue(context, temp)

  return {
    lines: [
      ...left.lines,
      ...right.lines,
      ...emitPrepareOwnedValueWrite(temp),
      emitStatusCheck(`ccjs_string_concat_parts(&ccjs_default_allocator, ${left.bytes}, ${left.length}, ${right.bytes}, ${right.length}, &${temp})`, context)
    ],
    expression: temp
  }
}

function emitCStringConversionValueExpression(expression, context) {
  const [arg] = expression.args
  const type = inferExpressionType(arg, context)
  const temp = nextCName(context, 'ccjs_value')
  registerOwnedValue(context, temp)

  if (type === 'string') {
    const value = emitPreparedStringBytesOperand(arg, context, 'ccjs_string_conversion')

    return {
      lines: [
        ...value.lines,
        ...emitPrepareOwnedValueWrite(temp),
        emitStatusCheck(`ccjs_string_from_literal(&ccjs_default_allocator, ${value.bytes}, ${value.length}, &${temp})`, context)
      ],
      expression: temp
    }
  }

  const value = emitPreparedNumberExpression(arg, context)
  const helper = type === 'boolean'
    ? `ccjs_string_from_bool(&ccjs_default_allocator, (${value.expression}) != 0, &${temp})`
    : `ccjs_string_from_number(&ccjs_default_allocator, ${value.expression}, &${temp})`

  return {
    lines: [
      ...value.lines,
      ...emitPrepareOwnedValueWrite(temp),
      emitStatusCheck(helper, context)
    ],
    expression: temp
  }
}

function emitCStringTrimValueExpression(expression, context) {
  const value = emitPreparedStringBytesOperand(expression.callee.object, context, 'ccjs_trim_string')
  const temp = nextCName(context, 'ccjs_value')
  registerOwnedValue(context, temp)

  return {
    lines: [
      ...value.lines,
      ...emitPrepareOwnedValueWrite(temp),
      emitStatusCheck(`ccjs_string_trim_parts(&ccjs_default_allocator, ${value.bytes}, ${value.length}, &${temp})`, context)
    ],
    expression: temp
  }
}

function emitCStringSliceValueExpression(expression, context) {
  const value = emitPreparedStringBytesOperand(expression.callee.object, context, 'ccjs_slice_string')
  const start = emitPreparedNumberExpression(expression.args[0], context)
  const end = expression.args[1] == null
    ? {
        lines: [],
        expression: value.length
      }
    : emitPreparedNumberExpression(expression.args[1], context)
  const temp = nextCName(context, 'ccjs_value')
  registerOwnedValue(context, temp)

  return {
    lines: [
      ...value.lines,
      ...start.lines,
      ...end.lines,
      ...emitPrepareOwnedValueWrite(temp),
      emitStatusCheck(`ccjs_string_slice_parts(&ccjs_default_allocator, ${value.bytes}, ${value.length}, (size_t)(${start.expression}), (size_t)(${end.expression}), &${temp})`, context)
    ],
    expression: temp
  }
}

function emitConsoleLogStatement(args, context) {
  if (args.length === 0) {
    return ['printf("\\n");']
  }

  const lines: string[] = []
  const parts: string[] = []
  const values: string[] = []

  for (const arg of args) {
    const value = emitConsoleLogValue(arg, context)

    lines.push(...value.lines)
    parts.push(value.format)
    values.push(...value.values)
  }

  if (values.length === 0) {
    lines.push(`printf("${escapeCString(parts.join(' '))}\\n");`)
  } else {
    lines.push(`printf("${escapeCString(parts.join(' '))}\\n", ${values.join(', ')});`)
  }

  return lines
}

function emitConsoleLogValue(expression, context) {
  if (expression?.type === 'TemplateLiteral' && expression.raw.includes('${')) {
    return emitTemplateLogValue(expression, context)
  }

  const type = inferExpressionType(expression, context)

  if (type === 'string') {
    return emitStringLogValue(expression, context)
  }

  if (type === 'number' || type === 'boolean') {
    return emitNumberLogValue(expression, type, context)
  }

  context.diagnostics.push(diagnostic(cUnsupportedExpressionCode(type), 'this console.log argument is not supported by the current C backend slice', expression.loc))

  return {
    lines: [],
    format: '%g',
    values: ['0']
  }
}

function emitTemplateLogValue(expression, context) {
  const lines: string[] = []
  const formats: string[] = []
  const values: string[] = []
  const parts = parseTemplateLogParts(expression.raw, context, expression.loc)

  for (const part of parts) {
    if (part.type === 'text') {
      formats.push(part.value.replaceAll('%', '%%'))
      continue
    }

    const placeholder = parseTemplatePlaceholder(part.value, expression.loc, context)

    if (placeholder == null) {
      continue
    }

    const value = emitConsoleLogValue(placeholder, context)

    lines.push(...value.lines)
    formats.push(value.format)
    values.push(...value.values)
  }

  return {
    lines,
    format: formats.join(''),
    values
  }
}

function parseTemplateLogParts(raw, context, loc) {
  const body = raw.slice(1, -1)
  const parts: { type: string, value: string }[] = []
  let text = ''
  let index = 0

  while (index < body.length) {
    const char = body[index]

    if (char === '\\') {
      text += body.slice(index, index + 2)
      index += 2
      continue
    }

    if (char === '$' && body[index + 1] === '{') {
      if (text !== '') {
        parts.push({
          type: 'text',
          value: text
        })
        text = ''
      }

      const end = body.indexOf('}', index + 2)

      if (end === -1) {
        context.diagnostics.push(diagnostic('CCJS_C_STRING_EXPR', 'unterminated template placeholder in C console.log', loc))
        return parts
      }

      parts.push({
        type: 'placeholder',
        value: body.slice(index + 2, end).trim()
      })
      index = end + 1
      continue
    }

    text += char
    index += 1
  }

  if (text !== '') {
    parts.push({
      type: 'text',
      value: text
    })
  }

  return parts
}

function parseTemplatePlaceholder(value, loc, context) {
  if (value === '') {
    context.diagnostics.push(diagnostic('CCJS_C_STRING_EXPR', 'empty template placeholder in C console.log', loc))
    return null
  }

  if (/^-?\d+(?:\.\d+)?$/.test(value)) {
    return {
      type: 'NumberLiteral',
      value,
      loc
    }
  }

  if (value === 'true' || value === 'false') {
    return {
      type: 'BooleanLiteral',
      value: value === 'true',
      loc
    }
  }

  const names = value.split('.')

  if (!names.every(name => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name))) {
    context.diagnostics.push(diagnostic('CCJS_C_STRING_EXPR', 'C console.log template placeholders currently support only identifiers and dotted members', loc))
    return null
  }

  if (!context.variables.has(names[0])) {
    context.diagnostics.push(diagnostic('CCJS_UNKNOWN_NAME', `unknown name ${names[0]}`, loc))
    return null
  }

  let expression: AnyNode = {
    type: 'Reference',
    path: [names[0]],
    loc
  }

  for (const property of names.slice(1)) {
    expression = {
      type: 'MemberExpression',
      object: expression,
      property,
      loc
    }
  }

  return expression
}

function emitStringLogValue(expression, context) {
  if (expression?.type === 'Reference') {
    const name = expression.path.join('_')

    if (isBoxedRuntimeStringName(name, context)) {
      const string = nextCName(context, 'ccjs_log_string')

      return {
        lines: [
          emitRuntimeTypeCheck(`(*${name}).tag != CCJS_TAG_STRING || (*${name}).as.ref == 0`, context),
          `ccjs_string* ${string} = (ccjs_string*)(*${name}).as.ref;`
        ],
        format: '%.*s',
        values: [`(int)${string}->len`, `${string}->bytes`]
      }
    }

    const reference = emitReference(expression, context)

    if (context.runtimeStrings.has(reference)) {
      return {
        lines: [],
        format: '%.*s',
        values: [`(int)${reference}->len`, `${reference}->bytes`]
      }
    }
  }

  if (isMemberAccessExpression(expression)) {
    const member = resolveKnownObjectMember(expression, context)

    if (member?.valueType === 'string') {
      return emitRuntimeStringLogValue(temp => `ccjs_object_get_known(${emitObjectValueReference(member.objectName, context)}, ${member.index}, &${temp})`, context)
    }
  }

  if (isIndexAccessExpression(expression)) {
    const element = resolveKnownArrayIndex(expression, context)

    if (element?.valueType === 'string') {
      return emitRuntimeStringLogValue(temp => `ccjs_array_get(${element.arrayName}, ${element.index}, &${temp})`, context)
    }

    const field = resolveKnownObjectIndex(expression, context)

    if (field?.valueType === 'string') {
      return emitRuntimeStringLogValue(temp => `ccjs_object_get(${emitObjectValueReference(field.objectName, context)}, ${cStringLiteral(field.key)}, ${utf8ByteLength(field.key)}, &${temp})`, context)
    }

    const runtimeElement = resolveRuntimeArrayIndex(expression, context)

    if (runtimeElement?.valueType === 'string') {
      const value = emitPreparedRuntimeArrayIndexValue(expression, runtimeElement, context, 'ccjs_log_value')
      const string = nextCName(context, 'ccjs_log_string')

      return {
        lines: [
          ...value.lines,
          emitRuntimeTypeCheck(`${value.expression}.tag != CCJS_TAG_STRING || ${value.expression}.as.ref == 0`, context),
          `ccjs_string* ${string} = (ccjs_string*)${value.expression}.as.ref;`
        ],
        format: '%.*s',
        values: [`(int)${string}->len`, `${string}->bytes`]
      }
    }
  }

  if (expression?.type === 'CallExpression' && inferExpressionType(expression, context) === 'string') {
    const value = emitCValueExpression(expression, context)
    const string = nextCName(context, 'ccjs_log_string')

    return {
      lines: [
        ...value.lines,
        `ccjs_string* ${string} = (ccjs_string*)${value.expression}.as.ref;`
      ],
      format: '%.*s',
      values: [`(int)${string}->len`, `${string}->bytes`]
    }
  }

  if (isStringConcatExpression(expression, context)) {
    const value = emitCValueExpression(expression, context)
    const string = nextCName(context, 'ccjs_log_string')

    return {
      lines: [
        ...value.lines,
        `ccjs_string* ${string} = (ccjs_string*)${value.expression}.as.ref;`
      ],
      format: '%.*s',
      values: [`(int)${string}->len`, `${string}->bytes`]
    }
  }

  if (isNullishCoalescingExpression(expression) && canLowerCNullishCoalescingExpression(expression, context)) {
    const value = emitCValueExpression(expression, context)
    const string = nextCName(context, 'ccjs_log_string')

    return {
      lines: [
        ...value.lines,
        emitRuntimeTypeCheck(`${value.expression}.tag != CCJS_TAG_STRING || ${value.expression}.as.ref == 0`, context),
        `ccjs_string* ${string} = (ccjs_string*)${value.expression}.as.ref;`
      ],
      format: '%.*s',
      values: [`(int)${string}->len`, `${string}->bytes`]
    }
  }

  return {
    lines: [],
    format: '%s',
    values: [emitStringExpression(expression, context)]
  }
}

function emitNumberLogValue(expression, type, context) {
  if (isMemberAccessExpression(expression)) {
    const stringLength = emitPreparedStringLengthExpression(expression, context)

    if (stringLength != null) {
      return {
        lines: stringLength.lines,
        format: '%g',
        values: [`((double)${stringLength.expression})`]
      }
    }

    const length = emitPreparedArrayLengthExpression(expression, context)

    if (length != null) {
      return {
        lines: length.lines,
        format: '%g',
        values: [`((double)${length.expression})`]
      }
    }

    const member = resolveKnownObjectMember(expression, context)

    if (member != null && ['number', 'boolean'].includes(member.valueType)) {
      return emitRuntimeNumberLogValue(member.valueType, temp => `ccjs_object_get_known(${emitObjectValueReference(member.objectName, context)}, ${member.index}, &${temp})`, context)
    }
  }

  if (isIndexAccessExpression(expression)) {
    const element = resolveKnownArrayIndex(expression, context)

    if (element != null && ['number', 'boolean'].includes(element.valueType)) {
      return emitRuntimeNumberLogValue(element.valueType, temp => `ccjs_array_get(${element.arrayName}, ${element.index}, &${temp})`, context)
    }

    const field = resolveKnownObjectIndex(expression, context)

    if (field != null && ['number', 'boolean'].includes(field.valueType)) {
      return emitRuntimeNumberLogValue(field.valueType, temp => `ccjs_object_get(${emitObjectValueReference(field.objectName, context)}, ${cStringLiteral(field.key)}, ${utf8ByteLength(field.key)}, &${temp})`, context)
    }

    const runtimeElement = resolveRuntimeArrayIndex(expression, context)

    if (runtimeElement != null && ['number', 'boolean'].includes(runtimeElement.valueType)) {
      const value = emitPreparedRuntimeArrayIndexValue(expression, runtimeElement, context, 'ccjs_log_value')

      return {
        lines: value.lines,
        format: '%g',
        values: [runtimeElement.valueType === 'boolean' ? `((double)(${value.expression}.as.boolean ? 1 : 0))` : `${value.expression}.as.number`]
      }
    }
  }

  const value = emitPreparedNumberExpression(expression, context)

  return {
    lines: value.lines,
    format: '%g',
    values: [`((double)${value.expression})`]
  }
}

function emitRuntimeStringLogValue(emitGetCall, context) {
  const value = nextCName(context, 'ccjs_log_value')
  const string = nextCName(context, 'ccjs_log_string')
  registerOwnedValue(context, value)

  return {
    lines: [
      ...emitPrepareOwnedValueWrite(value),
      emitStatusCheck(emitGetCall(value), context),
      emitRuntimeTypeCheck(`${value}.tag != CCJS_TAG_STRING || ${value}.as.ref == 0`, context),
      `ccjs_string* ${string} = (ccjs_string*)${value}.as.ref;`
    ],
    format: '%.*s',
    values: [`(int)${string}->len`, `${string}->bytes`]
  }
}

function emitRuntimeNumberLogValue(valueType, emitGetCall, context) {
  const value = nextCName(context, 'ccjs_log_value')
  registerOwnedValue(context, value)

  return {
    lines: [
      ...emitPrepareOwnedValueWrite(value),
      emitStatusCheck(emitGetCall(value), context)
    ],
    format: '%g',
    values: [valueType === 'boolean' ? `((double)(${value}.as.boolean ? 1 : 0))` : `${value}.as.number`]
  }
}

function resolveRuntimeStringReference(expression, context) {
  if (expression?.type !== 'Reference' || expression.path.length !== 1) {
    return null
  }

  const name = expression.path[0]

  return context.runtimeStrings.has(name) ? name : null
}

function emitStringExpression(expression, context) {
  if (expression?.type === 'StringLiteral') {
    return JSON.stringify(expression.value)
  }

  if (expression?.type === 'TemplateLiteral' && !expression.raw.includes('${')) {
    return JSON.stringify(expression.raw.slice(1, -1))
  }

  if (expression?.type === 'Reference') {
    return emitReference(expression, context)
  }

  if (expression?.type === 'CallExpression') {
    return emitCallExpression(expression, context)
  }

  if (isNullishCoalescingExpression(expression)) {
    context.diagnostics.push(diagnostic('CCJS_C_NULLISH', 'nullish coalescing is not supported by the current C backend slice', expression.loc))
    return '""'
  }

  if (isMemberAccessExpression(expression)) {
    const member = resolveKnownObjectMember(expression, context)

    if (member != null && ['number', 'boolean'].includes(member.valueType)) {
      context.diagnostics.push(diagnostic('CCJS_C_UNSUPPORTED_EXPR', 'object field access must be assigned before it can be used by the current C backend slice', expression.loc))
      return '""'
    }
  }

  if (expression?.type === 'AwaitExpression') {
    context.diagnostics.push(diagnostic('CCJS_C_ASYNC', 'async/await is not supported by the current C backend slice', expression?.loc))
    return '""'
  }

  if (isOptionalChainExpression(expression)) {
    context.diagnostics.push(diagnostic('CCJS_C_OPTIONAL_CHAINING', 'optional chaining is not supported by the current C backend slice', expression?.loc))
    return '""'
  }

  context.diagnostics.push(diagnostic('CCJS_C_STRING_EXPR', 'this string expression is not supported by the current C backend slice', expression?.loc))
  return '""'
}

function emitNumberExpression(expression, context) {
  return emitPreparedNumberExpression(expression, context).expression
}

function emitPreparedNumberExpression(expression, context) {
  if (expression?.type === 'NumberLiteral') {
    return {
      lines: [],
      expression: expression.value
    }
  }

  if (isNarrowedNullableScalarReference(expression, context)) {
    const name = expression.path[0]
    const valueType = context.variables.get(name)

    return {
      lines: [],
      expression: valueType === 'boolean' ? `(${name}.as.boolean ? 1 : 0)` : `${name}.as.number`
    }
  }

  if (isNullableScalarRuntimeExpression(expression, context)) {
    context.diagnostics.push(diagnostic('CCJS_C_NULLISH', 'nullable scalar values must be narrowed with ?? before scalar use in the current C backend slice', expression.loc))

    return {
      lines: [],
      expression: '0'
    }
  }

  if (expression?.type === 'Reference') {
    return {
      lines: [],
      expression: emitReference(expression, context)
    }
  }

  if (expression?.type === 'BooleanLiteral') {
    return {
      lines: [],
      expression: expression.value ? '1' : '0'
    }
  }

  if (expression?.type === 'UnaryExpression') {
    const argument = emitPreparedNumberExpression(expression.argument, context)

    return {
      lines: argument.lines,
      expression: `(${expression.operator}${argument.expression})`
    }
  }

  if (expression?.type === 'BinaryExpression') {
    const scalarNullish = emitPreparedScalarNullishCoalescingExpression(expression, context)

    if (scalarNullish != null) {
      return scalarNullish
    }

    if (isNullishCoalescingExpression(expression)) {
      context.diagnostics.push(diagnostic('CCJS_C_NULLISH', 'nullish coalescing is not supported by the current C backend slice', expression.loc))

      return {
        lines: [],
        expression: '0'
      }
    }

    const leftType = inferExpressionType(expression.left, context)
    const rightType = inferExpressionType(expression.right, context)
    const nullableNullCompare = emitPreparedNullableNullCompareExpression(expression, context)

    if (nullableNullCompare != null) {
      return nullableNullCompare
    }

    if (['===', '!==', '==', '!='].includes(expression.operator) && leftType === 'string' && rightType === 'string') {
      return emitPreparedStringCompareExpression(expression, context)
    }

    if (leftType === 'string' || rightType === 'string') {
      context.diagnostics.push(diagnostic('CCJS_C_STRING_EXPR', 'string binary expressions are not supported by the current C backend slice', expression.loc))

      return {
        lines: [],
        expression: '0'
      }
    }

    if (['&&', '||'].includes(expression.operator)) {
      return emitPreparedLogicalExpression(expression, context)
    }

    const left = emitPreparedNumberExpression(expression.left, context)
    const right = emitPreparedNumberExpression(expression.right, context)

    return {
      lines: [
        ...left.lines,
        ...right.lines
      ],
      expression: `(${left.expression} ${emitCOperator(expression.operator)} ${right.expression})`
    }
  }

  if (expression?.type === 'AssignmentExpression') {
    const value = emitPreparedNumberExpression(expression.value, context)

    return {
      lines: value.lines,
      expression: `(${emitReference(expression.target, context)} = ${value.expression})`
    }
  }

  if (expression?.type === 'CallExpression') {
    if (isStringPredicateCall(expression, context)) {
      return emitPreparedStringPredicateCall(expression, context)
    }

    const collectionCall = emitPreparedCollectionCallExpression(expression, context)

    if (collectionCall != null) {
      return collectionCall
    }

    return emitPreparedCallExpression(expression, context)
  }

  if (isMemberAccessExpression(expression)) {
    const stringLength = emitPreparedStringLengthExpression(expression, context)

    if (stringLength != null) {
      return stringLength
    }

    const length = emitPreparedArrayLengthExpression(expression, context)

    if (length != null) {
      return length
    }

    const collectionSize = emitPreparedCollectionSizeExpression(expression, context)

    if (collectionSize != null) {
      return collectionSize
    }

    const member = resolveKnownObjectMember(expression, context)

    if (member != null && ['number', 'boolean'].includes(member.valueType)) {
      return emitPreparedRuntimeNumberValue(member.valueType, temp => `ccjs_object_get_known(${emitObjectValueReference(member.objectName, context)}, ${member.index}, &${temp})`, context)
    }
  }

  if (isIndexAccessExpression(expression)) {
    const element = resolveKnownArrayIndex(expression, context)

    if (element != null && ['number', 'boolean'].includes(element.valueType)) {
      return emitPreparedRuntimeNumberValue(element.valueType, temp => `ccjs_array_get(${element.arrayName}, ${element.index}, &${temp})`, context)
    }

    const field = resolveKnownObjectIndex(expression, context)

    if (field != null && ['number', 'boolean'].includes(field.valueType)) {
      return emitPreparedRuntimeNumberValue(field.valueType, temp => `ccjs_object_get(${emitObjectValueReference(field.objectName, context)}, ${cStringLiteral(field.key)}, ${utf8ByteLength(field.key)}, &${temp})`, context)
    }

    const runtimeElement = resolveRuntimeArrayIndex(expression, context)

    if (runtimeElement != null && ['number', 'boolean'].includes(runtimeElement.valueType)) {
      const value = emitPreparedRuntimeArrayIndexValue(expression, runtimeElement, context, 'ccjs_expr_value')

      return {
        lines: value.lines,
        expression: runtimeElement.valueType === 'boolean' ? `(${value.expression}.as.boolean ? 1 : 0)` : `${value.expression}.as.number`
      }
    }
  }

  if (expression?.type === 'AwaitExpression') {
    context.diagnostics.push(diagnostic('CCJS_C_ASYNC', 'async/await is not supported by the current C backend slice', expression?.loc))
    return {
      lines: [],
      expression: '0'
    }
  }

  if (isOptionalChainExpression(expression)) {
    context.diagnostics.push(diagnostic('CCJS_C_OPTIONAL_CHAINING', 'optional chaining is not supported by the current C backend slice', expression?.loc))
    return {
      lines: [],
      expression: '0'
    }
  }

  context.diagnostics.push(diagnostic('CCJS_C_NUMBER_EXPR', 'this number expression is not supported by the current C backend slice'))

  return {
    lines: [],
    expression: '0'
  }
}

function emitPreparedStringLengthExpression(expression, context) {
  if (expression?.type !== 'MemberExpression' || expression.property !== 'length' || !isStringLengthObject(expression.object, context)) {
    return null
  }

  const operand = emitPreparedStringBytesOperand(expression.object, context, 'ccjs_length_string')

  return {
    lines: operand.lines,
    expression: `((double)${operand.length})`
  }
}

function emitPreparedStringCompareExpression(expression, context) {
  const left = emitPreparedStringBytesOperand(expression.left, context)
  const right = emitPreparedStringBytesOperand(expression.right, context)
  const equals = `(${left.length} == ${right.length} && memcmp(${left.bytes}, ${right.bytes}, ${left.length}) == 0)`

  return {
    lines: [
      ...left.lines,
      ...right.lines
    ],
    expression: ['===', '=='].includes(expression.operator) ? equals : `(!${equals})`
  }
}

function emitPreparedLogicalExpression(expression, context) {
  const left = emitPreparedNumberExpression(expression.left, context)
  const leftNarrowing = resolveNullableScalarConditionNarrowing(expression.left, context)
  const rightNarrowed = expression.operator === '&&'
    ? leftNarrowing.trueNames
    : leftNarrowing.falseNames
  const right = withNullableScalarNarrowing(context, rightNarrowed, () => emitPreparedNumberExpression(expression.right, context))
  const temp = nextCName(context, 'ccjs_logical')

  if (expression.operator === '&&') {
    return {
      lines: [
        ...left.lines,
        `double ${temp} = 0;`,
        `if (${left.expression}) {`,
        ...right.lines.map(line => `  ${line}`),
        `  ${temp} = ${right.expression};`,
        '}'
      ],
      expression: temp
    }
  }

  return {
    lines: [
      ...left.lines,
      `double ${temp} = 0;`,
      `if (${left.expression}) {`,
      `  ${temp} = 1;`,
      '} else {',
      ...right.lines.map(line => `  ${line}`),
      `  ${temp} = ${right.expression};`,
      '}'
    ],
    expression: temp
  }
}

function emitPreparedScalarNullishCoalescingExpression(expression, context) {
  if (!canLowerCScalarNullishCoalescingExpression(expression, context)) {
    return null
  }

  const valueType = inferExpressionType(expression, context)
  const expectedTag = cRuntimeValueTag(valueType)
  const left = emitCValueExpression(expression.left, context)
  const right = emitPreparedNumberExpression(expression.right, context)
  const temp = nextCName(context, 'ccjs_nullable_scalar')
  const leftValue = valueType === 'boolean'
    ? `(${left.expression}.as.boolean ? 1 : 0)`
    : `${left.expression}.as.number`

  return {
    lines: [
      ...left.lines,
      `double ${temp} = 0;`,
      `if (${left.expression}.tag == CCJS_TAG_NULL) {`,
      ...right.lines.map(line => `  ${line}`),
      `  ${temp} = ${right.expression};`,
      '} else {',
      `  ${emitRuntimeTypeCheck(`${left.expression}.tag != ${expectedTag}`, context)}`,
      `  ${temp} = ${leftValue};`,
      '}'
    ],
    expression: temp
  }
}

function emitPreparedNullableNullCompareExpression(expression, context) {
  if (!['===', '!==', '==', '!='].includes(expression.operator)) {
    return null
  }

  const nullable = expression.left?.type === 'NullLiteral' ? expression.right : expression.left
  const maybeNull = expression.left?.type === 'NullLiteral' ? expression.left : expression.right

  if (maybeNull?.type !== 'NullLiteral' || !isNullableRuntimeExpression(nullable, context)) {
    return null
  }

  const value = emitCValueExpression(nullable, context)
  const equals = `(${value.expression}.tag == CCJS_TAG_NULL)`

  return {
    lines: value.lines,
    expression: ['===', '=='].includes(expression.operator) ? equals : `(!${equals})`
  }
}

function resolveNullableScalarConditionNarrowing(expression, context) {
  if (expression?.type !== 'BinaryExpression') {
    return emptyNullableScalarNarrowing()
  }

  if (expression.operator === '&&') {
    const left = resolveNullableScalarConditionNarrowing(expression.left, context)
    const right = withNullableScalarNarrowing(context, left.trueNames, () => resolveNullableScalarConditionNarrowing(expression.right, context))

    return {
      trueNames: uniqueNames([
        ...left.trueNames,
        ...right.trueNames
      ]),
      falseNames: intersectNames(left.falseNames, uniqueNames([
        ...left.trueNames,
        ...right.falseNames
      ]))
    }
  }

  if (expression.operator === '||') {
    const left = resolveNullableScalarConditionNarrowing(expression.left, context)
    const right = withNullableScalarNarrowing(context, left.falseNames, () => resolveNullableScalarConditionNarrowing(expression.right, context))

    return {
      trueNames: intersectNames(left.trueNames, uniqueNames([
        ...left.falseNames,
        ...right.trueNames
      ])),
      falseNames: uniqueNames([
        ...left.falseNames,
        ...right.falseNames
      ])
    }
  }

  return resolveNullableScalarNullCheckNarrowing(expression, context)
}

function resolveNullableScalarNullCheckNarrowing(expression, context) {
  if (expression?.type !== 'BinaryExpression' || !['===', '!==', '==', '!='].includes(expression.operator)) {
    return emptyNullableScalarNarrowing()
  }

  const nullable = expression.left?.type === 'NullLiteral' ? expression.right : expression.left
  const maybeNull = expression.left?.type === 'NullLiteral' ? expression.left : expression.right

  if (maybeNull?.type !== 'NullLiteral' || nullable?.type !== 'Reference' || nullable.path.length !== 1) {
    return emptyNullableScalarNarrowing()
  }

  const name = nullable.path[0]

  if (!context.nullableVariables.has(name) || !isNullableScalarType(context.variables.get(name))) {
    return emptyNullableScalarNarrowing()
  }

  if (['!==', '!='].includes(expression.operator)) {
    return {
      trueNames: [name],
      falseNames: []
    }
  }

  return {
    trueNames: [],
    falseNames: [name]
  }
}

function emptyNullableScalarNarrowing() {
  return {
    trueNames: [],
    falseNames: []
  }
}

function uniqueNames(names) {
  return [...new Set(names)]
}

function intersectNames(left, right) {
  const rightNames = new Set(right)

  return uniqueNames(left.filter(name => rightNames.has(name)))
}

function isNarrowedNullableScalarReference(expression, context) {
  return expression?.type === 'Reference'
    && expression.path.length === 1
    && context.narrowedNullableScalars.has(expression.path[0])
    && context.nullableVariables.has(expression.path[0])
    && isNullableScalarType(context.variables.get(expression.path[0]))
}

function clearNullableScalarNarrowing(name, context) {
  context.narrowedNullableScalars.delete(name)

  return []
}

function emitPreparedStringPredicateCall(expression, context) {
  const value = emitPreparedStringBytesOperand(expression.callee.object, context, 'ccjs_string_method_value')
  const search = emitPreparedStringBytesOperand(expression.args[0], context, 'ccjs_string_method_search')
  const helper = cStringPredicateHelperName(expression.callee.property)

  return {
    lines: [
      ...value.lines,
      ...search.lines
    ],
    expression: `(${helper}(${value.bytes}, ${value.length}, ${search.bytes}, ${search.length}) ? 1 : 0)`
  }
}

function emitPreparedStringBytesOperand(expression, context, tempPrefix = 'ccjs_cmp_string') {
  if (expression?.type === 'StringLiteral') {
    return {
      lines: [],
      bytes: cStringLiteral(expression.value),
      length: `${utf8ByteLength(expression.value)}`
    }
  }

  if (expression?.type === 'TemplateLiteral' && !expression.raw.includes('${')) {
    const value = expression.raw.slice(1, -1)

    return {
      lines: [],
      bytes: cStringLiteral(value),
      length: `${utf8ByteLength(value)}`
    }
  }

  if (expression?.type === 'TemplateLiteral') {
    context.diagnostics.push(diagnostic('CCJS_C_STRING_EXPR', 'template string comparison operands with placeholders are not supported by the current C backend slice', expression.loc))

    return {
      lines: [],
      bytes: '""',
      length: '0'
    }
  }

  if (expression?.type === 'Reference' && expression.path.length === 1) {
    const name = expression.path[0]

    if (context.variables.get(name) === 'string') {
      if (isBoxedRuntimeStringName(name, context)) {
        const string = nextCName(context, tempPrefix)

        return {
          lines: [
            emitRuntimeTypeCheck(`(*${name}).tag != CCJS_TAG_STRING || (*${name}).as.ref == 0`, context),
            `ccjs_string* ${string} = (ccjs_string*)(*${name}).as.ref;`
          ],
          bytes: `${string}->bytes`,
          length: `${string}->len`
        }
      }

      const reference = emitReference(expression, context)

      if (context.runtimeStrings.has(reference)) {
        return {
          lines: [],
          bytes: `${reference}->bytes`,
          length: `${reference}->len`
        }
      }

      return {
        lines: [],
        bytes: reference,
        length: `strlen(${reference})`
      }
    }
  }

  if (inferExpressionType(expression, context) === 'string') {
    const value = emitCValueExpression(expression, context)
    const string = nextCName(context, tempPrefix)

    return {
      lines: [
        ...value.lines,
        `ccjs_string* ${string} = (ccjs_string*)${value.expression}.as.ref;`
      ],
      bytes: `${string}->bytes`,
      length: `${string}->len`
    }
  }

  context.diagnostics.push(diagnostic('CCJS_C_STRING_EXPR', 'this string operand is not supported by the current C backend slice', expression?.loc))

  return {
    lines: [],
    bytes: '""',
    length: '0'
  }
}

function emitPreparedRuntimeNumberValue(valueType, emitGetCall, context) {
  const value = nextCName(context, 'ccjs_expr_value')
  registerOwnedValue(context, value)

  return {
    lines: [
      ...emitPrepareOwnedValueWrite(value),
      emitStatusCheck(emitGetCall(value), context)
    ],
    expression: valueType === 'boolean' ? `(${value}.as.boolean ? 1 : 0)` : `${value}.as.number`
  }
}

function emitCExpression(expression, context) {
  if (isNullishCoalescingExpression(expression)) {
    context.diagnostics.push(diagnostic('CCJS_C_NULLISH', 'nullish coalescing is not supported by the current C backend slice', expression.loc))
    return '0'
  }

  const type = inferExpressionType(expression, context)

  if (type === 'string') {
    return emitStringExpression(expression, context)
  }

  if (type === 'function') {
    context.diagnostics.push(diagnostic('CCJS_C_FUNCTION_VALUE', 'function values are not supported by the current C backend slice', expression?.loc))
    return '0'
  }

  if (type === 'optional') {
    context.diagnostics.push(diagnostic('CCJS_C_OPTIONAL_CHAINING', 'optional chaining is not supported by the current C backend slice', expression?.loc))
    return '0'
  }

  if (type === 'js-global') {
    context.diagnostics.push(diagnostic('CCJS_C_JS_GLOBAL', 'this JS global is not supported by the current C backend slice', expression?.loc))
    return '0'
  }

  return emitNumberExpression(expression, context)
}

function emitReference(expression, context) {
  if (expression?.type === 'Reference') {
    const name = expression.path.join('_')

    if (context.variables.has(name)) {
      return context.boxedVariables.has(name) ? `(*${name})` : name
    }

    return context.functionNames.get(name) ?? name
  }

  context.diagnostics.push(diagnostic('CCJS_C_ASSIGNMENT_TARGET', 'this assignment target is not supported by the current C backend slice', expression?.loc))
  return '_'
}

function emitCallExpression(expression, context) {
  return `${emitCallee(expression.callee, context)}(${expression.args.map(arg => emitCExpression(arg, context)).join(', ')})`
}

function emitPreparedCallExpression(expression, context) {
  const arrayMapCall = emitPreparedArrayMapCallExpression(expression, context)

  if (arrayMapCall != null) {
    return arrayMapCall
  }

  const arrayFilterCall = emitPreparedArrayFilterCallExpression(expression, context)

  if (arrayFilterCall != null) {
    return arrayFilterCall
  }

  const arraySortCall = emitPreparedArraySortCallExpression(expression, context)

  if (arraySortCall != null) {
    return arraySortCall
  }

  const collectionCall = emitPreparedCollectionCallExpression(expression, context)

  if (collectionCall != null) {
    return collectionCall
  }

  const callbackType = resolveRuntimeCallbackCalleeType(expression.callee, context)

  if (callbackType != null) {
    return emitRuntimeCallbackCall(expression, callbackType, context)
  }

  const params = resolveFunctionParams(expression.callee, context)

  if (params == null) {
    return {
      lines: [],
      expression: emitCallExpression(expression, context)
    }
  }

  const lines: string[] = []
  const args: string[] = []

  for (const [index, arg] of expression.args.entries()) {
    if (isNullableScalarParam(params[index])) {
      const value = emitNullableScalarValueExpression(arg, context)

      lines.push(...value.lines)
      args.push(value.expression)
    } else if (isNullableFunctionType(params[index]?.valueType, params[index]?.nullable)) {
      const value = emitNullableFunctionValueExpression(arg, params[index]?.functionType, context)

      lines.push(...value.lines)
      args.push(value.expression)
    } else if (params[index]?.valueType === 'string') {
      const value = emitCValueExpression(arg, context)

      lines.push(...value.lines)
      args.push(value.expression)
    } else if (params[index]?.valueType === 'object') {
      const value = emitCValueExpression(arg, context)

      lines.push(...value.lines)
      args.push(value.expression)
    } else if (params[index]?.valueType === 'function') {
      const runtimeFunctionType = resolveRuntimeFunctionArgumentType(expression.callee, index, params[index], context)

      if (runtimeFunctionType != null) {
        const value = emitRuntimeCallbackValue(arg, runtimeFunctionType, context)

        lines.push(...value.lines)
        args.push(value.expression)
      } else {
        args.push(emitFunctionValueExpression(arg, context))
      }
    } else {
      args.push(emitCExpression(arg, context))
    }
  }

  if (isThrowingFunctionCallee(expression.callee, context)) {
    return emitPreparedThrowingCallExpression(expression, args, lines, context)
  }

  return {
    lines,
    expression: `${emitCallee(expression.callee, context)}(${args.join(', ')})`
  }
}

function emitPreparedThrowingCallExpression(expression, args, preparedLines, context) {
  const name = expression.callee.path[0]
  const returnType = context.functionReturnTypes.get(name) ?? 'void'
  const returnNullable = context.functionReturnNullables.get(name) === true
  const callArgs = [...args]
  const lines: string[] = [...preparedLines]
  let result = ''

  if (currentErrorTarget(context) == null && !context.throwingFunction) {
    context.diagnostics.push(diagnostic('CCJS_C_THROW', 'uncaught throwing function calls must be inside try/catch in the current C backend slice', expression.loc))
  }

  registerErrorChannel(context)
  lines.push(...emitPrepareOwnedValueWrite('ccjs_error'))

  if (returnType !== 'void') {
    if (isManagedRuntimeReturnType(returnType) || (returnNullable && isNullableScalarType(returnType))) {
      result = nextCName(context, 'ccjs_call_result')
      lines.push(`ccjs_value ${result} = ccjs_undefined_value();`)
    } else {
      result = nextCName(context, 'ccjs_call_result')
      lines.push(`double ${result} = 0;`)
    }

    callArgs.push(`&${result}`)
  }

  callArgs.push('&ccjs_error')

  const status = nextCName(context, 'ccjs_call_status')

  lines.push(`ccjs_status ${status} = ${emitCallee(expression.callee, context)}(${callArgs.join(', ')});`)
  lines.push(...emitThrowingCallStatusCheck(status, context))

  return {
    lines,
    expression: result
  }
}

function emitThrowingCallStatusCheck(status, context) {
  const target = currentErrorTarget(context)
  const lines = [
    `if (${status} == CCJS_ERR_THROW) {`,
    '  ccjs_error_active = 1;'
  ]

  if (target != null) {
    lines.push(`  goto ${target};`)
  } else if (context.throwingFunction) {
    lines.push('  ccjs_status_result = CCJS_ERR_THROW;')
    lines.push('  goto ccjs_cleanup;')
  } else {
    lines.push(`  ${emitFailureStatement(context)}`)
  }

  lines.push('}')
  lines.push(`if (${status} != CCJS_OK) ${emitFailureStatement(context)}`)

  return lines
}

function isThrowingFunctionCallee(callee, context) {
  return callee?.type === 'Reference' && callee.path.length === 1 && isThrowingFunctionName(callee.path[0], context)
}

function isThrowingFunctionName(name, context) {
  return context.throwingFunctions?.has(name) === true
}

function emitCallee(callee, context) {
  const timeRuntimeCall = cTimeRuntimeCallName(callee)

  if (timeRuntimeCall != null) {
    return timeRuntimeCall
  }

  if (callee.type === 'Reference' && callee.path.length === 1) {
    if (isCJsGlobalRoot(callee.path[0])) {
      context.diagnostics.push(diagnostic('CCJS_C_JS_GLOBAL', 'this JS global is not supported by the current C backend slice', callee.loc))
      return '_'
    }

    return context.functionNames.get(callee.path[0]) ?? callee.path[0]
  }

  if (usesCJsGlobal(callee)) {
    context.diagnostics.push(diagnostic('CCJS_C_JS_GLOBAL', 'this JS global is not supported by the current C backend slice', callee.loc))
    return '_'
  }

  context.diagnostics.push(diagnostic('CCJS_C_CALL_EXPR', 'this call expression is not supported by the current C backend slice', callee.loc))
  return '_'
}

function emitFunctionValueExpression(expression, context) {
  if (expression?.type === 'ArrowFunctionExpression') {
    const wrapper = context.callbackArrowWrappers.get(expression)

    if (wrapper?.kind === 'plain-arrow') {
      return wrapper.name
    }

    context.diagnostics.push(diagnostic('CCJS_C_FUNCTION_VALUE', 'capturing or unsupported inline callbacks are not supported by the current C backend slice; use a named function or a non-capturing inline callback with a supported signature', expression.loc))

    return '0'
  }

  if (expression?.type === 'Reference' && expression.path.length === 1) {
    const name = expression.path[0]

    if (context.variables.get(name) === 'function') {
      return name
    }

    if (context.functionNames.has(name)) {
      return context.functionNames.get(name)
    }
  }

  context.diagnostics.push(diagnostic('CCJS_C_FUNCTION_VALUE', 'this function value is not supported by the current C backend slice', expression?.loc))

  return '0'
}

function resolveRuntimeCallbackCalleeType(callee, context) {
  if (callee?.type !== 'Reference' || callee.path.length !== 1) {
    return null
  }

  const name = callee.path[0]

  if (!context.runtimeCallbacks.has(name)) {
    return null
  }

  const functionType = context.functionTypes.get(name)

  return isSupportedRuntimeCallbackType(functionType) ? normalizeFunctionType(functionType) : null
}

function isRuntimeArrowCallbackExpression(expression, context) {
  return context.callbackArrowWrappers.get(expression)?.kind === 'arrow'
}

function emitRuntimeCallbackVariableDeclaration(statement, context) {
  const functionType = normalizeFunctionType(statement.functionType)

  context.variables.set(statement.name, 'function')
  context.functionTypes.set(statement.name, functionType)
  context.runtimeCallbacks.add(statement.name)
  registerOwnedValue(context, statement.name)

  return emitRuntimeCallbackValueInto(statement.init, functionType, statement.name, context)
}

function emitRuntimeCallbackValue(expression, functionType, context) {
  if (expression?.type === 'Reference' && expression.path.length === 1 && context.runtimeCallbacks.has(expression.path[0])) {
    return {
      lines: [],
      expression: expression.path[0]
    }
  }

  const temp = nextCName(context, 'ccjs_callback')
  registerOwnedValue(context, temp)

  return {
    lines: emitRuntimeCallbackValueInto(expression, functionType, temp, context),
    expression: temp
  }
}

function emitRuntimeCallbackValueInto(expression, functionType, out, context) {
  if (expression?.type === 'Reference' && expression.path.length === 1 && context.runtimeCallbacks.has(expression.path[0])) {
    return [
      ...emitPrepareOwnedValueWrite(out),
      `${out} = ${expression.path[0]};`,
      `ccjs_retain(${out});`
    ]
  }

  if (expression?.type === 'ArrowFunctionExpression') {
    const wrapper = context.callbackArrowWrappers.get(expression)

    if (wrapper == null) {
      context.diagnostics.push(diagnostic('CCJS_C_FUNCTION_VALUE', 'runtime C callback wrapper was not generated for this arrow function', expression.loc))
      return [
        ...emitPrepareOwnedValueWrite(out),
        `${out} = ccjs_undefined_value();`
      ]
    }

    return emitRuntimeArrowCallbackValueInto(wrapper, out, context)
  }

  if (expression?.type !== 'Reference' || expression.path.length !== 1 || !context.functionNames.has(expression.path[0])) {
    context.diagnostics.push(diagnostic('CCJS_C_FUNCTION_VALUE', 'runtime C callbacks currently require a named non-capturing function', expression?.loc))
    return [
      ...emitPrepareOwnedValueWrite(out),
      `${out} = ccjs_undefined_value();`
    ]
  }

  const wrapper = runtimeCallbackWrapperFor(expression.path[0], functionType, context)

  if (wrapper == null) {
    context.diagnostics.push(diagnostic('CCJS_C_FUNCTION_VALUE', 'runtime C callback wrapper was not generated for this function value', expression.loc))
    return [
      ...emitPrepareOwnedValueWrite(out),
      `${out} = ccjs_undefined_value();`
    ]
  }

  return [
    ...emitPrepareOwnedValueWrite(out),
    emitStatusCheck(`ccjs_callback_new(&ccjs_default_allocator, ${wrapper.name}, 0, 0, &${out})`, context)
  ]
}

function emitRuntimeArrowCallbackValueInto(wrapper, out, context) {
  const lines = [
    ...emitPrepareOwnedValueWrite(out)
  ]

  for (const capture of wrapper.captures) {
    if (capture.mutable && !isSupportedMutableRuntimeArrowCapture(capture, context)) {
      context.diagnostics.push(diagnostic('CCJS_C_FUNCTION_VALUE', 'capturing this mutable binding in C callbacks requires unsupported boxed closure storage', wrapper.expression.loc))
    }

    if (!['number', 'boolean', 'string', 'object'].includes(capture.valueType)) {
      context.diagnostics.push(diagnostic('CCJS_C_FUNCTION_VALUE', 'capturing C callbacks currently support only const number/boolean/string/object bindings', wrapper.expression.loc))
    }
  }

  if (wrapper.captures.length === 0) {
    lines.push(emitStatusCheck(`ccjs_callback_new(&ccjs_default_allocator, ${wrapper.name}, 0, 0, &${out})`, context))
    return lines
  }

  const contextName = nextCName(context, 'ccjs_callback_ctx')

  lines.push(`${wrapper.contextTypeName}* ${contextName} = ccjs_default_alloc(0, sizeof(${wrapper.contextTypeName}), _Alignof(${wrapper.contextTypeName}));`)
  lines.push(`if (${contextName} == 0) ${emitFailureStatement(context)}`)

  for (const capture of wrapper.captures) {
    lines.push(...emitRuntimeArrowCaptureStoreLines(capture, contextName, context))
  }

  lines.push(`if (ccjs_callback_new(&ccjs_default_allocator, ${wrapper.name}, ${contextName}, ${wrapper.finalizerName}, &${out}) != CCJS_OK) {`)
  lines.push(`  ${wrapper.finalizerName}(${contextName});`)
  lines.push(`  ${emitFailureStatement(context)}`)
  lines.push('}')

  return lines
}

function emitRuntimeArrowCaptureStoreLines(capture, contextName, context) {
  const field = `${contextName}->${emitRuntimeArrowCaptureField(capture)}`

  if (isSupportedMutableRuntimeArrowCapture(capture, context)) {
    return [
      `${field} = ${capture.name};`
    ]
  }

  if (isRetainedRuntimeArrowCapture(capture)) {
    if (capture.valueType === 'string') {
      return [
        `${field}.tag = CCJS_TAG_STRING;`,
        `${field}.as.ref = (ccjs_ref*)&${capture.name}->header;`,
        `ccjs_retain(${field});`
      ]
    }

    return [
      `${field} = ${capture.name};`,
      `ccjs_retain(${field});`
    ]
  }

  return [
    `${field} = ${capture.name};`
  ]
}

function emitRuntimeCallbackCall(expression, functionType, context) {
  const lines: string[] = []
  const args: string[] = []

  for (const arg of expression.args) {
    const value = emitCValueExpression(arg, context)

    lines.push(...value.lines)
    args.push(value.expression)
  }

  const out = nextCName(context, 'ccjs_callback_out')
  registerOwnedValue(context, out)
  lines.push(...emitPrepareOwnedValueWrite(out))

  if (args.length === 0) {
    lines.push(emitStatusCheck(`ccjs_callback_call(${emitReference(expression.callee, context)}, 0, 0, &${out})`, context))
  } else {
    const argArray = nextCName(context, 'ccjs_callback_args')

    lines.push(`ccjs_value ${argArray}[] = { ${args.join(', ')} };`)
    lines.push(emitStatusCheck(`ccjs_callback_call(${emitReference(expression.callee, context)}, ${argArray}, ${args.length}, &${out})`, context))
  }

  return {
    lines,
    expression: ''
  }
}

function emitOptionalRuntimeCallbackCallExpression(expression, context) {
  const functionType = resolveRuntimeCallbackCalleeType(expression.callee, context)

  if (functionType == null) {
    context.diagnostics.push(diagnostic('CCJS_C_OPTIONAL_CHAINING', 'optional calls currently require a nullable runtime callback value in the C backend', expression.loc))
    return []
  }

  const callee = emitReference(expression.callee, context)
  const lines: string[] = [
    `if (${callee}.tag != CCJS_TAG_NULL) {`,
    `  ${emitRuntimeTypeCheck(`${callee}.tag != CCJS_TAG_FUNCTION || ${callee}.as.ref == 0`, context)}`
  ]
  const args: string[] = []

  for (const arg of expression.args) {
    const value = emitCValueExpression(arg, context)

    lines.push(...value.lines.map(line => `  ${line}`))
    args.push(value.expression)
  }

  const out = nextCName(context, 'ccjs_callback_out')
  registerOwnedValue(context, out)
  lines.push(...emitPrepareOwnedValueWrite(out).map(line => `  ${line}`))

  if (args.length === 0) {
    lines.push(`  ${emitStatusCheck(`ccjs_callback_call(${callee}, 0, 0, &${out})`, context)}`)
  } else {
    const argArray = nextCName(context, 'ccjs_callback_args')

    lines.push(`  ccjs_value ${argArray}[] = { ${args.join(', ')} };`)
    lines.push(`  ${emitStatusCheck(`ccjs_callback_call(${callee}, ${argArray}, ${args.length}, &${out})`, context)}`)
  }

  lines.push('}')

  return lines
}

function emitOptionalRuntimeCallbackCallValueExpression(expression, context) {
  const functionType = resolveRuntimeCallbackCalleeType(expression.callee, context)
  const resultType = inferExpressionType(expression, context)
  const expectedTag = cRuntimeValueTag(resultType)

  if (functionType == null || !isRuntimeNullableType(functionType.returnType) || expectedTag == null) {
    context.diagnostics.push(diagnostic('CCJS_C_OPTIONAL_CHAINING', 'optional call results currently support nullable runtime callback results in the C backend', expression.loc))

    return {
      lines: [],
      expression: 'ccjs_null_value()'
    }
  }

  const callee = emitReference(expression.callee, context)
  const out = nextCName(context, 'ccjs_optional_call')
  const lines: string[] = [
    ...emitPrepareOwnedValueWrite(out),
    `${out} = ccjs_null_value();`,
    `if (${callee}.tag != CCJS_TAG_NULL) {`,
    `  ${emitRuntimeTypeCheck(`${callee}.tag != CCJS_TAG_FUNCTION || ${callee}.as.ref == 0`, context)}`
  ]
  const args: string[] = []

  registerOwnedValue(context, out)

  for (const arg of expression.args) {
    const value = emitCValueExpression(arg, context)

    lines.push(...value.lines.map(line => `  ${line}`))
    args.push(value.expression)
  }

  lines.push(...emitPrepareOwnedValueWrite(out).map(line => `  ${line}`))

  if (args.length === 0) {
    lines.push(`  ${emitStatusCheck(`ccjs_callback_call(${callee}, 0, 0, &${out})`, context)}`)
  } else {
    const argArray = nextCName(context, 'ccjs_callback_args')

    lines.push(`  ccjs_value ${argArray}[] = { ${args.join(', ')} };`)
    lines.push(`  ${emitStatusCheck(`ccjs_callback_call(${callee}, ${argArray}, ${args.length}, &${out})`, context)}`)
  }

  lines.push(`  ${emitRuntimeValueCheck(out, expectedTag, context)}`)
  lines.push('}')

  return {
    lines,
    expression: out
  }
}

function resolveFunctionParams(callee, context) {
  if (callee.type !== 'Reference' || callee.path.length !== 1) {
    return null
  }

  return context.functionParams.get(callee.path[0]) ?? null
}

function inferExpressionType(expression, context) {
  if (expression?.type === 'CallExpression' && cTimeRuntimeCallName(expression.callee) != null) {
    return 'number'
  }

  if (isErrorConstructorExpression(expression)) {
    return 'object'
  }

  if (expression?.type === 'NewExpression' && collectionConstructorName(expression) === 'Map') {
    return 'map'
  }

  if (expression?.type === 'NewExpression' && collectionConstructorName(expression) === 'Set') {
    return 'set'
  }

  if (isStringConversionCall(expression, context)) {
    return 'string'
  }

  if (isStringTrimCall(expression, context)) {
    return 'string'
  }

  if (isStringSliceCall(expression, context)) {
    return 'string'
  }

  if (isStringPredicateCall(expression, context)) {
    return 'boolean'
  }

  if (expression?.type === 'CallExpression' && usesCJsGlobal(expression.callee)) {
    return 'js-global'
  }

  if (expression?.type === 'NewExpression' && usesCJsGlobal(expression.callee)) {
    return 'js-global'
  }

  if (expression?.valueType != null && expression.valueType !== 'unknown') {
    return expression.valueType
  }

  if (expression?.type === 'StringLiteral') {
    return 'string'
  }

  if (expression?.type === 'TemplateLiteral') {
    return 'string'
  }

  if (expression?.type === 'Reference') {
    return context.variables.get(expression.path.join('.')) ?? (context.functionNames.has(expression.path[0]) ? 'function' : (isCJsGlobalRoot(expression.path[0]) ? 'js-global' : 'number'))
  }

  if (expression?.type === 'ArrowFunctionExpression') {
    return 'function'
  }

  if (expression?.type === 'BooleanLiteral') {
    return 'boolean'
  }

  if (expression?.type === 'UnaryExpression') {
    return expression.operator === '!' ? 'boolean' : 'number'
  }

  if (expression?.type === 'BinaryExpression') {
    if (['===', '!==', '==', '!=', '<', '<=', '>', '>=', '&&', '||'].includes(expression.operator)) {
      return 'boolean'
    }

    if (expression.operator === '??') {
      const left = inferExpressionType(expression.left, context)

      return left === 'null' || left === 'unknown' ? inferExpressionType(expression.right, context) : left
    }

    if (expression.operator === '+' && (inferExpressionType(expression.left, context) === 'string' || inferExpressionType(expression.right, context) === 'string')) {
      return 'string'
    }

    return 'number'
  }

  if (expression?.type === 'ArrayLiteral') {
    return 'array'
  }

  if (expression?.type === 'ObjectLiteral') {
    return 'object'
  }

  if (isMemberAccessExpression(expression)) {
    if (isArrayLengthExpression(expression, context)) {
      return 'number'
    }

    const length = resolveKnownArrayLength(expression, context)

    if (length != null) {
      return 'number'
    }

    const member = resolveKnownObjectMember(expression, context)

    if (member != null) {
      return member.valueType
    }

    return expression.type === 'OptionalMemberExpression' ? 'optional' : 'number'
  }

  if (isIndexAccessExpression(expression)) {
    const element = resolveKnownArrayIndex(expression, context)
    const field = resolveKnownObjectIndex(expression, context)
    const runtimeElement = resolveRuntimeArrayIndex(expression, context)

    if (element != null) {
      return element.valueType
    }

    if (field != null) {
      return field.valueType
    }

    if (runtimeElement != null) {
      return runtimeElement.valueType
    }

    return expression.type === 'OptionalIndexExpression' ? 'optional' : 'number'
  }

  if (expression?.type === 'CallExpression' && expression.callee.type === 'Reference') {
    return context.functionReturnTypes.get(expression.callee.path[0]) ?? 'number'
  }

  if (expression?.type === 'NewExpression') {
    return 'class'
  }

  if (expression?.type === 'AwaitExpression') {
    return 'async'
  }

  if (isOptionalChainExpression(expression)) {
    return 'optional'
  }

  return 'number'
}

function isConsoleLog(expression) {
  return expression?.type === 'CallExpression'
    && expression.callee.type === 'MemberExpression'
    && expression.callee.object.type === 'Reference'
    && expression.callee.object.path.length === 1
    && expression.callee.object.path[0] === 'console'
    && ['log', 'info', 'warn', 'error'].includes(expression.callee.property)
}

function emitCOperator(operator) {
  if (operator === '===' || operator === '==') {
    return '=='
  }

  if (operator === '!==' || operator === '!=') {
    return '!='
  }

  return operator
}

function cUnsupportedExpressionCode(type) {
  if (type === 'function') {
    return 'CCJS_C_FUNCTION_VALUE'
  }

  if (type === 'optional') {
    return 'CCJS_C_OPTIONAL_CHAINING'
  }

  if (type === 'class') {
    return 'CCJS_C_CLASS'
  }

  if (type === 'async') {
    return 'CCJS_C_ASYNC'
  }

  if (type === 'js-global') {
    return 'CCJS_C_JS_GLOBAL'
  }

  if (type === 'map' || type === 'set') {
    return 'CCJS_C_COLLECTION'
  }

  return 'CCJS_C_UNSUPPORTED_EXPR'
}

function isOptionalChainExpression(expression) {
  return expression?.type === 'OptionalMemberExpression'
    || expression?.type === 'OptionalIndexExpression'
    || expression?.type === 'OptionalCallExpression'
}

function isNullishCoalescingExpression(expression) {
  return expression?.type === 'BinaryExpression' && expression.operator === '??'
}

function isErrorConstructorExpression(expression) {
  return expression?.type === 'NewExpression'
    && expression.callee.type === 'Reference'
    && expression.callee.path.length === 1
    && expression.callee.path[0] === 'Error'
}

function isErrorValueExpression(expression, context) {
  return isKnownErrorValueExpression(expression, context, context.errorObjectNames)
}

function isKnownErrorValueExpression(expression, context, errorObjectNames) {
  if (isErrorConstructorExpression(expression)) {
    return true
  }

  if (expression?.type === 'Reference' && expression.path.length === 1) {
    return errorObjectNames.has(expression.path[0])
  }

  return false
}

function registerErrorObjectShape(context, name) {
  context.errorObjectNames.add(name)
  context.objectShapes.set(name, [
    {
      name: 'name',
      valueType: 'string'
    },
    {
      name: 'message',
      valueType: 'string'
    }
  ])
}

function canLowerCNullishCoalescingExpression(expression, context) {
  if (!isNullishCoalescingExpression(expression)) {
    return false
  }

  const resultType = inferExpressionType(expression, context)

  return isRuntimeNullableType(resultType)
    && (inferExpressionType(expression.left, context) === 'null' || isNullableRuntimeExpression(expression.left, context))
}

function canLowerCScalarNullishCoalescingExpression(expression, context) {
  if (!isNullishCoalescingExpression(expression)) {
    return false
  }

  const resultType = inferExpressionType(expression, context)

  return ['number', 'boolean'].includes(resultType)
    && (inferExpressionType(expression.left, context) === 'null' || isNullableRuntimeExpression(expression.left, context))
}

function isNullableRuntimeExpression(expression, context) {
  if (expression?.type === 'Reference' && expression.path.length === 1) {
    return context.nullableVariables.has(expression.path[0])
  }

  if (expression?.type === 'CallExpression' && expression.callee.type === 'Reference' && expression.callee.path.length === 1) {
    return context.functionReturnNullables.get(expression.callee.path[0]) === true
  }

  if (expression?.type === 'OptionalCallExpression') {
    const functionType = resolveRuntimeCallbackCalleeType(expression.callee, context)

    return functionType != null && isRuntimeNullableType(functionType.returnType)
  }

  if (isNullishCoalescingExpression(expression)) {
    return false
  }

  return expression?.nullable === true && isRuntimeNullableType(inferExpressionType(expression, context))
}

function isStringConcatExpression(expression, context) {
  return expression?.type === 'BinaryExpression'
    && expression.operator === '+'
    && inferExpressionType(expression.left, context) === 'string'
    && inferExpressionType(expression.right, context) === 'string'
}

function isRuntimeProducedStringExpression(expression, context) {
  return (expression?.type === 'CallExpression' && inferExpressionType(expression, context) === 'string')
    || isStringConcatExpression(expression, context)
    || (isNullishCoalescingExpression(expression) && canLowerCNullishCoalescingExpression(expression, context))
    || isBoxedRuntimeStringReference(expression, context)
}

function isStringConversionCall(expression, context) {
  if (expression?.type !== 'CallExpression' || expression.callee.type !== 'Reference' || expression.callee.path.length !== 1 || expression.callee.path[0] !== 'String' || expression.args.length !== 1) {
    return false
  }

  return ['boolean', 'number', 'string'].includes(inferExpressionType(expression.args[0], context))
}

function isStringTrimCall(expression, context) {
  if (expression?.type !== 'CallExpression' || expression.callee.type !== 'MemberExpression' || expression.callee.property !== 'trim' || expression.args.length !== 0) {
    return false
  }

  return isStringLengthObject(expression.callee.object, context)
}

function isStringSliceCall(expression, context) {
  if (expression?.type !== 'CallExpression' || expression.callee.type !== 'MemberExpression' || expression.callee.property !== 'slice' || expression.args.length < 1 || expression.args.length > 2) {
    return false
  }

  return isStringLengthObject(expression.callee.object, context) && expression.args.every(arg => inferExpressionType(arg, context) === 'number')
}

function isStringPredicateCall(expression, context) {
  if (expression?.type !== 'CallExpression' || expression.callee.type !== 'MemberExpression' || !cStringPredicateMethods.has(expression.callee.property) || expression.args.length !== 1) {
    return false
  }

  return isStringLengthObject(expression.callee.object, context) && inferExpressionType(expression.args[0], context) === 'string'
}

function isArrayMethodCall(expression) {
  return expression?.type === 'CallExpression'
    && expression.callee.type === 'MemberExpression'
    && cArrayMethods.has(expression.callee.property)
}

function emitArraySortVariableDeclaration(statement, sorted, context) {
  registerOwnedValue(context, statement.name)
  context.variables.set(statement.name, 'array')

  const shape = context.arrayShapes.get(sorted.expression)

  if (shape != null) {
    context.arrayShapes.set(statement.name, shape.map(element => ({ ...element })))
  } else {
    context.runtimeArrayElementTypes.set(statement.name, statement.arrayElementType ?? sorted.elementType ?? 'unknown')
  }

  return [
    ...sorted.lines,
    ...emitPrepareOwnedValueWrite(statement.name),
    `${statement.name} = ${sorted.expression};`,
    `ccjs_retain(${statement.name});`
  ]
}

function emitArrayFilterVariableDeclaration(statement, filtered, context) {
  registerOwnedValue(context, statement.name)
  context.variables.set(statement.name, 'array')
  context.runtimeArrayElementTypes.set(statement.name, statement.arrayElementType ?? filtered.elementType ?? 'unknown')

  return [
    ...filtered.lines,
    ...emitPrepareOwnedValueWrite(statement.name),
    `${statement.name} = ${filtered.expression};`,
    `ccjs_retain(${statement.name});`
  ]
}

function emitArrayMapVariableDeclaration(statement, mapped, context) {
  registerOwnedValue(context, statement.name)
  context.variables.set(statement.name, 'array')
  context.runtimeArrayElementTypes.set(statement.name, statement.arrayElementType ?? mapped.elementType ?? 'unknown')

  return [
    ...mapped.lines,
    ...emitPrepareOwnedValueWrite(statement.name),
    `${statement.name} = ${mapped.expression};`,
    `ccjs_retain(${statement.name});`
  ]
}

function emitPreparedArraySortCallExpression(expression, context) {
  if (expression?.type !== 'CallExpression' || expression.callee.type !== 'MemberExpression' || expression.callee.property !== 'sort' || expression.args.length > 1) {
    return null
  }

  const receiver = emitPreparedArrayReceiver(expression.callee.object, context)

  if (receiver == null) {
    return null
  }

  if (expression.args.length === 1) {
    return emitPreparedArrayComparatorSortCallExpression(expression, receiver, context)
  }

  return {
    lines: [
      ...receiver.lines,
      emitStatusCheck(`ccjs_array_sort(${receiver.expression})`, context)
    ],
    expression: receiver.expression,
    elementType: receiver.elementType
  }
}

function emitPreparedArrayComparatorSortCallExpression(expression, receiver, context) {
  const callback = expression.args[0]

  if (callback?.type !== 'ArrowFunctionExpression' || !callback.expressionBody || callback.params.length > 2 || !['number', 'boolean', 'string'].includes(receiver.elementType)) {
    return null
  }

  const length = nextCName(context, 'ccjs_sort_length')
  const index = nextCName(context, 'ccjs_sort_index')
  const scan = nextCName(context, 'ccjs_sort_scan')
  const left = nextCName(context, 'ccjs_sort_left')
  const right = nextCName(context, 'ccjs_sort_right')
  const compare = nextCName(context, 'ccjs_sort_compare')

  registerOwnedValue(context, left)
  registerOwnedValue(context, right)

  const body = withVariableScope(context, () => {
    const input = emitPreparedArraySortComparatorInput(callback, receiver, left, right, context)
    const result = emitPreparedNumberExpression(callback.body, context)

    return [
      ...input,
      ...result.lines,
      `double ${compare} = ${result.expression};`,
      `if (!(${compare} > 0)) break;`,
      emitStatusCheck(`ccjs_array_set(${receiver.expression}, ${scan} - 1, ${right})`, context),
      emitStatusCheck(`ccjs_array_set(${receiver.expression}, ${scan}, ${left})`, context)
    ]
  })

  return {
    lines: [
      ...receiver.lines,
      `size_t ${length} = 0;`,
      emitStatusCheck(`ccjs_array_len(${receiver.expression}, &${length})`, context),
      `for (size_t ${index} = 1; ${index} < ${length}; ${index} += 1) {`,
      `  for (size_t ${scan} = ${index}; ${scan} > 0; ${scan} -= 1) {`,
      ...emitPrepareOwnedValueWrite(left).map(line => `    ${line}`),
      `    ${emitStatusCheck(`ccjs_array_get(${receiver.expression}, ${scan} - 1, &${left})`, context)}`,
      ...emitPrepareOwnedValueWrite(right).map(line => `    ${line}`),
      `    ${emitStatusCheck(`ccjs_array_get(${receiver.expression}, ${scan}, &${right})`, context)}`,
      ...body.map(line => `    ${line}`),
      '  }',
      '}',
      ...emitPrepareOwnedValueWrite(right),
      ...emitPrepareOwnedValueWrite(left)
    ],
    expression: receiver.expression,
    elementType: receiver.elementType
  }
}

function emitPreparedArrayMapCallExpression(expression, context) {
  if (expression?.type !== 'CallExpression' || expression.callee.type !== 'MemberExpression' || expression.callee.property !== 'map' || expression.args.length !== 1) {
    return null
  }

  const callback = expression.args[0]

  if (callback?.type !== 'ArrowFunctionExpression' || !callback.expressionBody || callback.params.length > 2) {
    return null
  }

  const receiver = emitPreparedArrayReceiver(expression.callee.object, context)

  if (receiver == null || !['number', 'boolean', 'string'].includes(receiver.elementType)) {
    return null
  }

  const out = nextCName(context, 'ccjs_map_array')
  const length = nextCName(context, 'ccjs_map_length')
  const index = nextCName(context, 'ccjs_map_index')
  const value = nextCName(context, 'ccjs_map_value')
  let mappedElementType = expression.arrayElementType ?? 'unknown'

  registerOwnedValue(context, out)
  registerOwnedValue(context, value)

  const body = withVariableScope(context, () => {
    const input = emitPreparedArrayCallbackInput(callback, receiver, value, index, context)

    mappedElementType = mappedElementType === 'unknown'
      ? inferExpressionType(callback.body, context)
      : mappedElementType

    if (!['number', 'boolean', 'string'].includes(mappedElementType)) {
      return null
    }

    const mappedValue = emitPreparedArrayMapValue(callback.body, mappedElementType, context)

    return [
      ...input,
      ...mappedValue.lines,
      emitStatusCheck(`ccjs_array_push(${out}, ${mappedValue.expression})`, context)
    ]
  })

  if (body == null) {
    return null
  }

  return {
    lines: [
      ...receiver.lines,
      ...emitPrepareOwnedValueWrite(out),
      emitStatusCheck(`ccjs_array_new(&ccjs_default_allocator, 0, &${out})`, context),
      `size_t ${length} = 0;`,
      emitStatusCheck(`ccjs_array_len(${receiver.expression}, &${length})`, context),
      `for (size_t ${index} = 0; ${index} < ${length}; ${index} += 1) {`,
      ...emitPrepareOwnedValueWrite(value).map(line => `  ${line}`),
      `  ${emitStatusCheck(`ccjs_array_get(${receiver.expression}, ${index}, &${value})`, context)}`,
      ...body.map(line => `  ${line}`),
      '}',
      ...emitPrepareOwnedValueWrite(value)
    ],
    expression: out,
    elementType: mappedElementType
  }
}

function emitPreparedArrayFilterCallExpression(expression, context) {
  if (expression?.type !== 'CallExpression' || expression.callee.type !== 'MemberExpression' || expression.callee.property !== 'filter' || expression.args.length !== 1) {
    return null
  }

  const callback = expression.args[0]

  if (callback?.type !== 'ArrowFunctionExpression' || !callback.expressionBody || callback.params.length > 2) {
    return null
  }

  const receiver = emitPreparedArrayReceiver(expression.callee.object, context)

  if (receiver == null || !['number', 'boolean', 'string'].includes(receiver.elementType)) {
    return null
  }

  const out = nextCName(context, 'ccjs_filter_array')
  const length = nextCName(context, 'ccjs_filter_length')
  const index = nextCName(context, 'ccjs_filter_index')
  const value = nextCName(context, 'ccjs_filter_value')

  registerOwnedValue(context, out)
  registerOwnedValue(context, value)

  const body = withVariableScope(context, () => {
    const input = emitPreparedArrayCallbackInput(callback, receiver, value, index, context)
    const predicate = emitPreparedNumberExpression(callback.body, context)

    return [
      ...input,
      ...predicate.lines,
      `if (${predicate.expression}) {`,
      `  ${emitStatusCheck(`ccjs_array_push(${out}, ${value})`, context)}`,
      '}'
    ]
  })

  return {
    lines: [
      ...receiver.lines,
      ...emitPrepareOwnedValueWrite(out),
      emitStatusCheck(`ccjs_array_new(&ccjs_default_allocator, 0, &${out})`, context),
      `size_t ${length} = 0;`,
      emitStatusCheck(`ccjs_array_len(${receiver.expression}, &${length})`, context),
      `for (size_t ${index} = 0; ${index} < ${length}; ${index} += 1) {`,
      ...emitPrepareOwnedValueWrite(value).map(line => `  ${line}`),
      `  ${emitStatusCheck(`ccjs_array_get(${receiver.expression}, ${index}, &${value})`, context)}`,
      ...body.map(line => `  ${line}`),
      '}',
      ...emitPrepareOwnedValueWrite(value)
    ],
    expression: out,
    elementType: receiver.elementType
  }
}

function emitPreparedArrayCallbackInput(callback, receiver, value, index, context) {
  const lines: string[] = []
  const valueParam = callback.params[0]
  const indexParam = callback.params[1]

  if (valueParam != null) {
    context.variables.set(valueParam.name, receiver.elementType)

    if (receiver.elementType === 'string') {
      context.runtimeStrings.add(valueParam.name)
      lines.push(emitRuntimeTypeCheck(`${value}.tag != CCJS_TAG_STRING || ${value}.as.ref == 0`, context))
      lines.push(`ccjs_string* ${valueParam.name} = (ccjs_string*)${value}.as.ref;`)
    } else if (receiver.elementType === 'boolean') {
      lines.push(emitRuntimeTypeCheck(`${value}.tag != CCJS_TAG_BOOL`, context))
      lines.push(`double ${valueParam.name} = (${value}.as.boolean ? 1 : 0);`)
    } else {
      lines.push(emitRuntimeTypeCheck(`${value}.tag != CCJS_TAG_NUMBER`, context))
      lines.push(`double ${valueParam.name} = ${value}.as.number;`)
    }
  }

  if (indexParam != null) {
    context.variables.set(indexParam.name, 'number')
    lines.push(`double ${indexParam.name} = (double)${index};`)
  }

  return lines
}

function emitPreparedArrayMapValue(expression, valueType, context) {
  if (valueType === 'string') {
    return emitCValueExpression(expression, context)
  }

  const value = emitPreparedNumberExpression(expression, context)

  return {
    lines: value.lines,
    expression: valueType === 'boolean'
      ? `ccjs_bool_value((${value.expression}) != 0)`
      : `ccjs_number_value(${value.expression})`
  }
}

function emitPreparedArraySortComparatorInput(callback, receiver, left, right, context) {
  const lines: string[] = []
  const leftParam = callback.params[0]
  const rightParam = callback.params[1]

  if (leftParam != null) {
    lines.push(...emitPreparedArraySortComparatorParam(leftParam.name, receiver.elementType, left, context))
  }

  if (rightParam != null) {
    lines.push(...emitPreparedArraySortComparatorParam(rightParam.name, receiver.elementType, right, context))
  }

  return lines
}

function emitPreparedArraySortComparatorParam(name, elementType, value, context) {
  context.variables.set(name, elementType)

  if (elementType === 'string') {
    context.runtimeStrings.add(name)
    return [
      emitRuntimeTypeCheck(`${value}.tag != CCJS_TAG_STRING || ${value}.as.ref == 0`, context),
      `ccjs_string* ${name} = (ccjs_string*)${value}.as.ref;`
    ]
  }

  if (elementType === 'boolean') {
    return [
      emitRuntimeTypeCheck(`${value}.tag != CCJS_TAG_BOOL`, context),
      `double ${name} = (${value}.as.boolean ? 1 : 0);`
    ]
  }

  return [
    emitRuntimeTypeCheck(`${value}.tag != CCJS_TAG_NUMBER`, context),
    `double ${name} = ${value}.as.number;`
  ]
}

function emitPreparedArrayReceiver(expression, context) {
  if (expression?.type === 'ArrayLiteral') {
    const value = emitCArrayLiteralValueExpression(expression, context)

    return {
      lines: value.lines,
      expression: value.expression,
      elementType: resolveForOfElementType(expression.elements.map(element => ({
        valueType: inferExpressionType(element, context)
      })))
    }
  }

  if (expression?.type === 'Reference' && expression.path.length === 1) {
    const name = expression.path[0]

    if (context.variables.get(name) !== 'array') {
      return null
    }

    return {
      lines: [],
      expression: name,
      elementType: context.runtimeArrayElementTypes.get(name) ?? resolveForOfElementType(context.arrayShapes.get(name) ?? [])
    }
  }

  if (expression?.type === 'CallExpression') {
    const valueType = inferExpressionType(expression, context)

    if (valueType !== 'array') {
      return null
    }

    const call = emitPreparedArrayMapCallExpression(expression, context) ?? emitPreparedArrayFilterCallExpression(expression, context) ?? emitPreparedArraySortCallExpression(expression, context)

    return call == null
      ? null
      : {
          lines: call.lines,
          expression: call.expression,
          elementType: call.elementType
        }
  }

  return null
}

function isCollectionConstructorExpression(expression) {
  return collectionConstructorName(expression) != null
}

function collectionConstructorName(expression) {
  if (expression?.type !== 'NewExpression' || expression.callee.type !== 'Reference' || expression.callee.path.length !== 1) {
    return null
  }

  return ['Map', 'Set'].includes(expression.callee.path[0]) ? expression.callee.path[0] : null
}

function emitPreparedCollectionCallExpression(expression, context) {
  if (expression?.type !== 'CallExpression' || expression.callee.type !== 'MemberExpression') {
    return null
  }

  const receiver = emitPreparedCollectionReceiver(expression.callee.object, context)

  if (receiver == null) {
    return null
  }

  const call = receiver.type === 'map'
    ? emitPreparedMapMethodCall(receiver.expression, expression, context)
    : emitPreparedSetMethodCall(receiver.expression, expression, context)

  return {
    lines: [
      ...receiver.lines,
      ...call.lines
    ],
    expression: call.expression
  }
}

function emitPreparedCollectionReceiver(expression, context) {
  if (expression?.type === 'Reference' && expression.path.length === 1) {
    const name = expression.path[0]
    const type = context.variables.get(name)

    return type === 'map' || type === 'set'
      ? {
          type,
          lines: [],
          expression: name
        }
      : null
  }

  if (expression?.type === 'CallExpression') {
    const valueType = inferExpressionType(expression, context)

    if (valueType !== 'map' && valueType !== 'set') {
      return null
    }

    const call = emitPreparedCollectionCallExpression(expression, context)

    return call == null || call.expression === ''
      ? null
      : {
          type: valueType,
          lines: call.lines,
          expression: call.expression
        }
  }

  return null
}

function emitPreparedMapMethodCall(name, expression, context) {
  const method = expression.callee.property

  if (method === 'clear') {
    return {
      lines: [
        emitStatusCheck(`ccjs_map_clear(${name})`, context)
      ],
      expression: ''
    }
  }

  if (method === 'set') {
    reportCCollectionHashability(inferExpressionType(expression.args[0], context), 'Map keys', expression.args[0]?.loc ?? expression.loc, context)
    const key = emitCValueExpression(expression.args[0], context)
    const value = emitCValueExpression(expression.args[1], context)

    return {
      lines: [
        ...key.lines,
        ...value.lines,
        emitStatusCheck(`ccjs_map_set(${name}, ${key.expression}, ${value.expression})`, context)
      ],
      expression: name
    }
  }

  if (method === 'get') {
    reportCCollectionHashability(inferExpressionType(expression.args[0], context), 'Map keys', expression.args[0]?.loc ?? expression.loc, context)
    const key = emitCValueExpression(expression.args[0], context)
    const valueType = inferExpressionType(expression, context)
    const out = nextCName(context, 'ccjs_map_value')
    registerOwnedValue(context, out)

    const lines = [
      ...key.lines,
      ...emitPrepareOwnedValueWrite(out),
      emitStatusCheck(`ccjs_map_get(${name}, ${key.expression}, &${out})`, context)
    ]

    if (valueType === 'number') {
      lines.push(emitRuntimeTypeCheck(`${out}.tag != CCJS_TAG_NUMBER`, context))
      return {
        lines,
        expression: `${out}.as.number`
      }
    }

    if (valueType === 'boolean') {
      lines.push(emitRuntimeTypeCheck(`${out}.tag != CCJS_TAG_BOOL`, context))
      return {
        lines,
        expression: `(${out}.as.boolean ? 1 : 0)`
      }
    }

    if (valueType === 'string') {
      lines.push(emitRuntimeTypeCheck(`${out}.tag != CCJS_TAG_STRING || ${out}.as.ref == 0`, context))
    }

    return {
      lines,
      expression: out
    }
  }

  if (method === 'has' || method === 'delete') {
    reportCCollectionHashability(inferExpressionType(expression.args[0], context), 'Map keys', expression.args[0]?.loc ?? expression.loc, context)
    const key = emitCValueExpression(expression.args[0], context)
    const out = nextCName(context, `ccjs_map_${method}`)
    const helper = method === 'has' ? 'ccjs_map_has' : 'ccjs_map_delete'

    return {
      lines: [
        ...key.lines,
        `bool ${out} = false;`,
        emitStatusCheck(`${helper}(${name}, ${key.expression}, &${out})`, context)
      ],
      expression: `(${out} ? 1 : 0)`
    }
  }

  context.diagnostics.push(diagnostic('CCJS_C_COLLECTION', `Map.${method} is not supported by the current C backend slice`, expression.loc))

  return {
    lines: [],
    expression: '0'
  }
}

function emitPreparedSetMethodCall(name, expression, context) {
  const method = expression.callee.property

  if (method === 'clear') {
    return {
      lines: [
        emitStatusCheck(`ccjs_set_clear(${name})`, context)
      ],
      expression: ''
    }
  }

  if (method === 'add') {
    reportCCollectionHashability(inferExpressionType(expression.args[0], context), 'Set values', expression.args[0]?.loc ?? expression.loc, context)
    const value = emitCValueExpression(expression.args[0], context)

    return {
      lines: [
        ...value.lines,
        emitStatusCheck(`ccjs_set_add(${name}, ${value.expression})`, context)
      ],
      expression: name
    }
  }

  if (method === 'has' || method === 'delete') {
    reportCCollectionHashability(inferExpressionType(expression.args[0], context), 'Set values', expression.args[0]?.loc ?? expression.loc, context)
    const value = emitCValueExpression(expression.args[0], context)
    const out = nextCName(context, `ccjs_set_${method}`)
    const helper = method === 'has' ? 'ccjs_set_has' : 'ccjs_set_delete'

    return {
      lines: [
        ...value.lines,
        `bool ${out} = false;`,
        emitStatusCheck(`${helper}(${name}, ${value.expression}, &${out})`, context)
      ],
      expression: `(${out} ? 1 : 0)`
    }
  }

  context.diagnostics.push(diagnostic('CCJS_C_COLLECTION', `Set.${method} is not supported by the current C backend slice`, expression.loc))

  return {
    lines: [],
    expression: '0'
  }
}

function emitPreparedCollectionSizeExpression(expression, context) {
  if (expression?.type !== 'MemberExpression' || expression.property !== 'size' || expression.object.type !== 'Reference' || expression.object.path.length !== 1) {
    return null
  }

  const name = expression.object.path[0]
  const type = context.variables.get(name)

  if (type !== 'map' && type !== 'set') {
    return null
  }

  const out = nextCName(context, `ccjs_${type}_size`)
  const helper = type === 'map' ? 'ccjs_map_size' : 'ccjs_set_size'

  return {
    lines: [
      `size_t ${out} = 0;`,
      emitStatusCheck(`${helper}(${name}, &${out})`, context)
    ],
    expression: out
  }
}

function cStringPredicateHelperName(method) {
  if (method === 'startsWith') {
    return 'ccjs_string_starts_with_parts'
  }

  if (method === 'endsWith') {
    return 'ccjs_string_ends_with_parts'
  }

  return 'ccjs_string_includes_parts'
}

function isStringLengthObject(expression, context) {
  if (expression == null) {
    return false
  }

  if (expression.type === 'StringLiteral') {
    return true
  }

  if (expression.type === 'TemplateLiteral') {
    return true
  }

  if (expression.type === 'Reference' && expression.path.length === 1) {
    const name = expression.path[0]

    return context.variables.get(name) === 'string' || context.runtimeStrings.has(name)
  }

  return inferExpressionType(expression, context) === 'string'
}

function isArrayLengthExpression(expression, context) {
  return expression?.type === 'MemberExpression'
    && expression.property === 'length'
    && inferExpressionType(expression.object, context) === 'array'
}

function isMemberAccessExpression(expression) {
  return expression?.type === 'MemberExpression' || expression?.type === 'OptionalMemberExpression'
}

function isIndexAccessExpression(expression) {
  return expression?.type === 'IndexExpression' || expression?.type === 'OptionalIndexExpression'
}

function resolveKnownObjectMember(expression, context) {
  if (!isMemberAccessExpression(expression) || expression.object.type !== 'Reference' || expression.object.path.length !== 1) {
    return null
  }

  const objectName = expression.object.path[0]
  const fields = context.objectShapes.get(objectName)

  if (fields == null) {
    return null
  }

  const index = fields.findIndex(field => field.name === expression.property)

  if (index === -1) {
    return null
  }

  return {
    objectName,
    index,
    valueType: fields[index].valueType,
    arrayElementType: fields[index].arrayElementType,
    mapKeyType: fields[index].mapKeyType,
    mapValueType: fields[index].mapValueType,
    setElementType: fields[index].setElementType
  }
}

function emitObjectValueReference(name, context) {
  return context.boxedVariables.has(name) && context.variables.get(name) === 'object' ? `(*${name})` : name
}

function resolveKnownObjectIndex(expression, context) {
  if (!isIndexAccessExpression(expression) || expression.object.type !== 'Reference' || expression.object.path.length !== 1 || expression.index.type !== 'StringLiteral') {
    return null
  }

  const objectName = expression.object.path[0]
  const fields = context.objectShapes.get(objectName)

  if (fields == null) {
    return null
  }

  const index = fields.findIndex(field => field.name === expression.index.value)

  if (index === -1) {
    return null
  }

  return {
    objectName,
    key: expression.index.value,
    index,
    valueType: fields[index].valueType,
    arrayElementType: fields[index].arrayElementType,
    mapKeyType: fields[index].mapKeyType,
    mapValueType: fields[index].mapValueType,
    setElementType: fields[index].setElementType
  }
}

function updateKnownObjectMemberValueType(member, valueType, context) {
  if (valueType === 'unknown') {
    return
  }

  const fields = context.objectShapes.get(member.objectName)

  if (fields == null || fields[member.index] == null) {
    return
  }

  fields[member.index] = {
    ...fields[member.index],
    valueType
  }
}

function registerObjectShape(context, name, shape) {
  if (shape?.fields == null) {
    return
  }

  context.objectShapes.set(name, shape.fields.map(field => ({
    name: field.name,
    valueType: field.valueType,
    arrayElementType: field.arrayElementType,
    mapKeyType: field.mapKeyType,
    mapValueType: field.mapValueType,
    setElementType: field.setElementType
  })))
}

function resolveKnownArrayIndex(expression, context) {
  if (expression?.type !== 'IndexExpression' || expression.object.type !== 'Reference' || expression.object.path.length !== 1 || expression.index.type !== 'NumberLiteral') {
    return null
  }

  const arrayName = expression.object.path[0]
  const elements = context.arrayShapes.get(arrayName)

  if (elements == null) {
    return null
  }

  const index = Number.parseInt(expression.index.value, 10)

  if (!Number.isInteger(index) || index < 0 || index >= elements.length) {
    return null
  }

  return {
    arrayName,
    index,
    valueType: elements[index].valueType
  }
}

function resolveRuntimeArrayIndex(expression, context) {
  if (expression?.type !== 'IndexExpression' || expression.index.type !== 'NumberLiteral') {
    return null
  }

  const index = Number.parseInt(expression.index.value, 10)

  if (!Number.isInteger(index) || index < 0) {
    return null
  }

  const valueType = resolveRuntimeArrayElementType(expression.object, context)

  return valueType == null ? null : {
    index,
    valueType
  }
}

function resolveOptionalRuntimeArrayIndex(expression, context) {
  if (expression?.type !== 'OptionalIndexExpression' || expression.index.type !== 'NumberLiteral') {
    return null
  }

  const index = Number.parseInt(expression.index.value, 10)

  if (!Number.isInteger(index) || index < 0) {
    return null
  }

  const valueType = resolveRuntimeArrayElementType(expression.object, context)

  return valueType == null ? null : {
    index,
    valueType
  }
}

function resolveRuntimeArrayElementType(expression, context) {
  if (expression?.type === 'Reference' && expression.path.length === 1) {
    return context.runtimeArrayElementTypes.get(expression.path[0]) ?? null
  }

  if (expression?.type === 'MemberExpression') {
    const member = resolveKnownObjectMember(expression, context)

    return member?.valueType === 'array' ? member.arrayElementType ?? 'unknown' : null
  }

  if (expression?.type === 'IndexExpression' && expression.index.type === 'StringLiteral') {
    const field = resolveKnownObjectIndex(expression, context)

    return field?.valueType === 'array' ? field.arrayElementType ?? 'unknown' : null
  }

  return null
}

function emitPreparedRuntimeArrayIndexValue(expression, element, context, prefix = 'ccjs_array_item') {
  const array = emitCValueExpression(expression.object, context)
  const value = nextCName(context, prefix)
  registerOwnedValue(context, value)

  return {
    lines: [
      ...array.lines,
      ...emitPrepareOwnedValueWrite(value),
      emitStatusCheck(`ccjs_array_get(${array.expression}, ${element.index}, &${value})`, context)
    ],
    expression: value
  }
}

function resolveKnownArrayLength(expression, context) {
  if (expression?.type !== 'MemberExpression' || expression.property !== 'length') {
    return null
  }

  if (expression.object.type === 'ArrayLiteral') {
    return `${expression.object.elements.length}`
  }

  if (expression.object.type !== 'Reference' || expression.object.path.length !== 1) {
    return null
  }

  const elements = context.arrayShapes.get(expression.object.path[0])

  return elements == null ? null : `${elements.length}`
}

function emitPreparedArrayLengthExpression(expression, context) {
  if (expression?.type !== 'MemberExpression' || expression.property !== 'length') {
    return null
  }

  const knownLength = resolveKnownArrayLength(expression, context)

  if (knownLength != null) {
    return {
      lines: [],
      expression: knownLength
    }
  }

  if (inferExpressionType(expression.object, context) !== 'array') {
    return null
  }

  const value = emitCValueExpression(expression.object, context)
  const temp = nextCName(context, 'ccjs_array_len')

  return {
    lines: [
      ...value.lines,
      `size_t ${temp} = 0;`,
      emitStatusCheck(`ccjs_array_len(${value.expression}, &${temp})`, context)
    ],
    expression: temp
  }
}

function resolveKnownForOfArray(expression, context) {
  if (expression?.type !== 'Reference' || expression.path.length !== 1) {
    return null
  }

  const name = expression.path[0]
  const elements = context.arrayShapes.get(name)

  return elements == null ? null : {
    name,
    elements
  }
}

function resolveRuntimeForOfArray(expression, context) {
  const elementType = resolveRuntimeArrayElementType(expression, context)

  if (elementType == null) {
    return null
  }

  if (expression?.type === 'Reference' && expression.path.length === 1) {
    return {
      name: expression.path[0],
      elementType,
      lines: []
    }
  }

  const value = emitCValueExpression(expression, context)

  return {
    name: value.expression,
    elementType,
    lines: value.lines
  }
}

function resolveForOfElementType(elements) {
  if (elements.length === 0) {
    return 'unknown'
  }

  const [first] = elements

  if (first?.valueType == null || first.valueType === 'unknown') {
    return 'unknown'
  }

  return elements.every(element => element.valueType === first.valueType) ? first.valueType : 'unknown'
}

function updateKnownArrayElementValueType(element, valueType, context) {
  if (valueType === 'unknown') {
    return
  }

  const elements = context.arrayShapes.get(element.arrayName)

  if (elements == null || elements[element.index] == null) {
    return
  }

  elements[element.index] = {
    ...elements[element.index],
    valueType
  }
}

function emitStatusCheck(call, context) {
  return `if (${call} != CCJS_OK) ${emitFailureStatement(context)}`
}

function emitRuntimeTypeCheck(condition, context) {
  return `if (${condition}) ${emitFailureStatement(context)}`
}

function emitFailureStatement(context) {
  if (context.throwingFunction && context.cleanupEnabled) {
    context.usedCleanupGoto = true
    return 'do { ccjs_status_result = CCJS_ERR_TYPE; goto ccjs_cleanup; } while (0);'
  }

  if (context.statusReturn) {
    return 'return CCJS_ERR_TYPE;'
  }

  if (context.cleanupEnabled) {
    context.usedCleanupGoto = true
    return 'goto ccjs_cleanup;'
  }

  return context.returnType === 'void' ? 'return;' : 'return 0;'
}

function registerOwnedValue(context, name) {
  if (!context.ownedValues.includes(name)) {
    context.ownedValues.push(name)
  }
}

function registerBoxedValue(context, name, valueType = 'number') {
  if (!context.boxedValues.includes(name)) {
    context.boxedValues.push(name)
  }

  context.boxedValueTypes.set(name, valueType)
}

function emitPrepareOwnedValueWrite(name) {
  return [
    `ccjs_release(${name});`,
    `${name} = ccjs_undefined_value();`
  ]
}

function shouldEmitCleanupLabel(context) {
  return context.throwingFunction
    || context.returnType !== 'void'
    || (context.returnType === 'void' && (context.ownedValues.length > 0 || context.boxedValues.length > 0 || context.usedCleanupGoto))
}

function emitReturnValueDeclarations(context) {
  if (context.returnNullable === true && isNullableScalarType(context.returnType)) {
    return ['ccjs_value ccjs_return = ccjs_undefined_value();']
  }

  if (isManagedRuntimeReturnType(context.returnType)) {
    return ['ccjs_value ccjs_return = ccjs_undefined_value();']
  }

  if (context.returnType !== 'void') {
    return ['double ccjs_return = 0;']
  }

  return []
}

function emitStatusResultDeclarations(context) {
  return context.throwingFunction ? ['ccjs_status ccjs_status_result = CCJS_OK;'] : []
}

function emitLoopFlowDeclarations(context) {
  return [
    ...(context.breakFlowUsed ? ['int ccjs_break_active = 0;'] : []),
    ...(context.continueFlowUsed ? ['int ccjs_continue_active = 0;'] : [])
  ]
}

function emitReturnFlowDeclarations(context) {
  return context.returnFlowUsed ? ['int ccjs_return_active = 0;'] : []
}

function emitOwnedValueDeclarations(context) {
  return context.ownedValues.map(name => `ccjs_value ${name} = ccjs_undefined_value();`)
}

function emitErrorChannelDeclarations(context) {
  return context.errorChannelUsed ? ['int ccjs_error_active = 0;'] : []
}

function emitBoxedValueDeclarations(context) {
  return context.boxedValues.map(name => isRuntimeBoxedValueType(context.boxedValueTypes.get(name))
    ? `ccjs_value* ${name} = 0;`
    : `double* ${name} = 0;`)
}

function emitOwnedValueCleanup(context) {
  return context.ownedValues.toReversed().map(name => `ccjs_release(${name});`)
}

function emitBoxedValueCleanup(context) {
  return context.boxedValues.toReversed().flatMap(name => isRuntimeBoxedValueType(context.boxedValueTypes.get(name))
    ? [
        `if (${name} != 0) {`,
        `  ccjs_release(*${name});`,
        `  ccjs_default_free(0, ${name}, sizeof(ccjs_value), _Alignof(ccjs_value));`,
        '}'
      ]
    : [`if (${name} != 0) ccjs_default_free(0, ${name}, sizeof(double), _Alignof(double));`])
}

function isRuntimeBoxedValueType(valueType) {
  return ['string', 'object'].includes(valueType)
}

function emitCleanupReturn(context) {
  if (context.throwingFunction) {
    return emitThrowingFunctionCleanupReturn(context)
  }

  if (isManagedRuntimeReturnType(context.returnType)) {
    return ['return ccjs_return;']
  }

  if (context.returnType !== 'void') {
    return ['return ccjs_return;']
  }

  return ['return;']
}

function emitThrowingFunctionErrorTransfer(context) {
  if (!context.throwingFunction) {
    return []
  }

  return [
    'if (ccjs_error_active) {',
    `  *${context.functionErrorOut} = ccjs_error;`,
    '  ccjs_error = ccjs_undefined_value();',
    '}'
  ]
}

function emitThrowingFunctionCleanupReturn(context) {
  const lines = [
    'if (ccjs_status_result != CCJS_OK) return ccjs_status_result;'
  ]

  if (context.returnType !== 'void') {
    lines.push(`*${context.functionReturnOut} = ccjs_return;`)
  }

  lines.push('return CCJS_OK;')

  return lines
}

function nextCName(context, prefix) {
  const name = `${prefix}_${context.nextId}`
  context.nextId += 1

  return name
}

function cStringLiteral(value) {
  return JSON.stringify(value)
}

function emitCIdentifier(value) {
  return value.replaceAll(/[^A-Za-z0-9_]/g, '_')
}

function utf8ByteLength(value) {
  return Buffer.byteLength(value, 'utf8')
}

function usesCJsGlobal(expression) {
  const root = rootReferenceName(expression)

  return root != null && isCJsGlobalRoot(root)
}

function cTimeRuntimeCallName(callee) {
  if (callee?.type !== 'MemberExpression' || callee.object.type !== 'Reference' || callee.object.path.length !== 1) {
    return null
  }

  if (callee.object.path[0] === 'Date' && callee.property === 'now') {
    return 'ccjs_date_now'
  }

  if (callee.object.path[0] === 'performance' && callee.property === 'now') {
    return 'ccjs_performance_now'
  }

  return null
}

function isCJsGlobalRoot(name) {
  return cJsGlobalRoots.has(name)
}

function rootReferenceName(expression) {
  if (expression?.type === 'Reference') {
    return expression.path[0]
  }

  if (expression?.type === 'MemberExpression' || expression?.type === 'OptionalMemberExpression') {
    return rootReferenceName(expression.object)
  }

  if (expression?.type === 'IndexExpression' || expression?.type === 'OptionalIndexExpression') {
    return rootReferenceName(expression.object)
  }

  return null
}

function usesCRuntime(program) {
  return program.body.some(item => itemUsesCRuntime(item))
}

function usesCCallbackRuntime(program) {
  return program.body.some(item => itemUsesCCallbackRuntime(item))
}

function usesCTimeRuntime(program) {
  return program.body.some(item => itemUsesCTimeRuntime(item))
}

function usesCStringCompare(program) {
  return program.body.some(item => itemUsesCStringCompare(item))
}

function usesCStringHeader(program) {
  return usesCStringCompare(program) || nodeUsesCStringLength(program) || nodeUsesCStringMethodCall(program) || nodeUsesCStringConversion(program)
}

function itemUsesCRuntime(item) {
  if (item.type === 'FunctionDeclaration') {
    return item.returnType === 'string'
      || (item.returnNullable === true && isRuntimeNullableType(item.returnType))
      || item.params.some(param => ['string', 'object'].includes(param.valueType) || isNullableScalarParam(param) || isNullableFunctionType(param.valueType, param.nullable) || (param.valueType === 'function' && isRuntimeFunctionType(param.functionType)))
      || item.body.some(statement => statementUsesCRuntime(statement))
  }

  if (item.type === 'ClassDeclaration') {
    return item.methods.some(method => method.body.some(statement => statementUsesCRuntime(statement)))
  }

  return statementUsesCRuntime(item)
}

function itemUsesCCallbackRuntime(item) {
  if (item.type === 'FunctionDeclaration') {
    return item.params.some(param => param.valueType === 'function' && (param.nullable === true || isRuntimeFunctionType(param.functionType)))
      || item.body.some(statement => statementUsesCCallbackRuntime(statement))
  }

  if (item.type === 'ClassDeclaration') {
    return item.methods.some(method => method.body.some(statement => statementUsesCCallbackRuntime(statement)))
  }

  return statementUsesCCallbackRuntime(item)
}

function itemUsesCTimeRuntime(item) {
  if (item.type === 'FunctionDeclaration') {
    return item.body.some(statement => statementUsesCTimeRuntime(statement))
  }

  if (item.type === 'ClassDeclaration') {
    return item.methods.some(method => method.body.some(statement => statementUsesCTimeRuntime(statement)))
  }

  return statementUsesCTimeRuntime(item)
}

function itemUsesCStringCompare(item) {
  if (item.type === 'FunctionDeclaration') {
    return item.body.some(statement => statementUsesCStringCompare(statement))
  }

  if (item.type === 'ClassDeclaration') {
    return item.methods.some(method => method.body.some(statement => statementUsesCStringCompare(statement)))
  }

  return statementUsesCStringCompare(item)
}

function statementUsesCRuntime(statement) {
  if (statement.type === 'VariableDeclaration') {
    return (statement.valueType === 'function' && isRuntimeFunctionType(statement.functionType)) || expressionUsesCRuntime(statement.init)
  }

  if (statement.type === 'ExpressionStatement') {
    return expressionUsesCRuntime(statement.expression)
  }

  if (statement.type === 'ReturnStatement') {
    return expressionUsesCRuntime(statement.argument)
  }

  if (statement.type === 'ThrowStatement') {
    return true
  }

  if (statement.type === 'BlockStatement') {
    return statement.body.some(item => statementUsesCRuntime(item))
  }

  if (statement.type === 'IfStatement') {
    return expressionUsesCRuntime(statement.condition)
      || statementUsesCRuntime(statement.consequent)
      || (statement.alternate != null && statementUsesCRuntime(statement.alternate))
  }

  if (statement.type === 'WhileStatement') {
    return expressionUsesCRuntime(statement.condition) || statementUsesCRuntime(statement.body)
  }

  if (statement.type === 'ForStatement') {
    return (statement.init != null && (statement.init.type === 'VariableDeclaration' ? statementUsesCRuntime(statement.init) : expressionUsesCRuntime(statement.init)))
      || expressionUsesCRuntime(statement.test)
      || expressionUsesCRuntime(statement.update)
      || statementUsesCRuntime(statement.body)
  }

  if (statement.type === 'ForOfStatement') {
    return expressionUsesCRuntime(statement.iterable) || statementUsesCRuntime(statement.body)
  }

  if (statement.type === 'SwitchStatement') {
    return expressionUsesCRuntime(statement.discriminant)
      || statement.cases.some(item => expressionUsesCRuntime(item.test) || item.consequent.some(child => statementUsesCRuntime(child)))
  }

  if (statement.type === 'TryStatement') {
    return true
  }

  return false
}

function statementUsesCCallbackRuntime(statement) {
  if (statement.type === 'VariableDeclaration') {
    return (statement.valueType === 'function' && (statement.nullable === true || isRuntimeFunctionType(statement.functionType))) || expressionUsesCCallbackRuntime(statement.init)
  }

  if (statement.type === 'ExpressionStatement') {
    return expressionUsesCCallbackRuntime(statement.expression)
  }

  if (statement.type === 'ReturnStatement') {
    return expressionUsesCCallbackRuntime(statement.argument)
  }

  if (statement.type === 'ThrowStatement') {
    return expressionUsesCCallbackRuntime(statement.argument)
  }

  if (statement.type === 'BlockStatement') {
    return statement.body.some(item => statementUsesCCallbackRuntime(item))
  }

  if (statement.type === 'IfStatement') {
    return expressionUsesCCallbackRuntime(statement.condition)
      || statementUsesCCallbackRuntime(statement.consequent)
      || (statement.alternate != null && statementUsesCCallbackRuntime(statement.alternate))
  }

  if (statement.type === 'WhileStatement') {
    return expressionUsesCCallbackRuntime(statement.condition) || statementUsesCCallbackRuntime(statement.body)
  }

  if (statement.type === 'ForStatement') {
    return (statement.init != null && (statement.init.type === 'VariableDeclaration' ? statementUsesCCallbackRuntime(statement.init) : expressionUsesCCallbackRuntime(statement.init)))
      || expressionUsesCCallbackRuntime(statement.test)
      || expressionUsesCCallbackRuntime(statement.update)
      || statementUsesCCallbackRuntime(statement.body)
  }

  if (statement.type === 'ForOfStatement') {
    return expressionUsesCCallbackRuntime(statement.iterable) || statementUsesCCallbackRuntime(statement.body)
  }

  if (statement.type === 'SwitchStatement') {
    return expressionUsesCCallbackRuntime(statement.discriminant)
      || statement.cases.some(item => expressionUsesCCallbackRuntime(item.test) || item.consequent.some(child => statementUsesCCallbackRuntime(child)))
  }

  if (statement.type === 'TryStatement') {
    return statementUsesCCallbackRuntime(statement.block)
      || (statement.handler != null && statementUsesCCallbackRuntime(statement.handler.body))
      || (statement.finalizer != null && statementUsesCCallbackRuntime(statement.finalizer))
  }

  return false
}

function statementUsesCTimeRuntime(statement) {
  if (statement.type === 'VariableDeclaration') {
    return expressionUsesCTimeRuntime(statement.init)
  }

  if (statement.type === 'ExpressionStatement') {
    return expressionUsesCTimeRuntime(statement.expression)
  }

  if (statement.type === 'ReturnStatement') {
    return expressionUsesCTimeRuntime(statement.argument)
  }

  if (statement.type === 'ThrowStatement') {
    return expressionUsesCTimeRuntime(statement.argument)
  }

  if (statement.type === 'BlockStatement') {
    return statement.body.some(item => statementUsesCTimeRuntime(item))
  }

  if (statement.type === 'IfStatement') {
    return expressionUsesCTimeRuntime(statement.condition)
      || statementUsesCTimeRuntime(statement.consequent)
      || (statement.alternate != null && statementUsesCTimeRuntime(statement.alternate))
  }

  if (statement.type === 'WhileStatement') {
    return expressionUsesCTimeRuntime(statement.condition) || statementUsesCTimeRuntime(statement.body)
  }

  if (statement.type === 'ForStatement') {
    return (statement.init != null && (statement.init.type === 'VariableDeclaration' ? statementUsesCTimeRuntime(statement.init) : expressionUsesCTimeRuntime(statement.init)))
      || expressionUsesCTimeRuntime(statement.test)
      || expressionUsesCTimeRuntime(statement.update)
      || statementUsesCTimeRuntime(statement.body)
  }

  if (statement.type === 'ForOfStatement') {
    return expressionUsesCTimeRuntime(statement.iterable) || statementUsesCTimeRuntime(statement.body)
  }

  if (statement.type === 'SwitchStatement') {
    return expressionUsesCTimeRuntime(statement.discriminant)
      || statement.cases.some(item => expressionUsesCTimeRuntime(item.test) || item.consequent.some(child => statementUsesCTimeRuntime(child)))
  }

  if (statement.type === 'TryStatement') {
    return statementUsesCTimeRuntime(statement.block)
      || (statement.handler != null && statementUsesCTimeRuntime(statement.handler.body))
      || (statement.finalizer != null && statementUsesCTimeRuntime(statement.finalizer))
  }

  return false
}

function statementUsesCStringCompare(statement) {
  if (statement.type === 'VariableDeclaration') {
    return expressionUsesCStringCompare(statement.init)
  }

  if (statement.type === 'ExpressionStatement') {
    return expressionUsesCStringCompare(statement.expression)
  }

  if (statement.type === 'ReturnStatement') {
    return expressionUsesCStringCompare(statement.argument)
  }

  if (statement.type === 'ThrowStatement') {
    return expressionUsesCStringCompare(statement.argument)
  }

  if (statement.type === 'BlockStatement') {
    return statement.body.some(item => statementUsesCStringCompare(item))
  }

  if (statement.type === 'IfStatement') {
    return expressionUsesCStringCompare(statement.condition)
      || statementUsesCStringCompare(statement.consequent)
      || (statement.alternate != null && statementUsesCStringCompare(statement.alternate))
  }

  if (statement.type === 'WhileStatement') {
    return expressionUsesCStringCompare(statement.condition) || statementUsesCStringCompare(statement.body)
  }

  if (statement.type === 'ForStatement') {
    return (statement.init != null && (statement.init.type === 'VariableDeclaration' ? statementUsesCStringCompare(statement.init) : expressionUsesCStringCompare(statement.init)))
      || expressionUsesCStringCompare(statement.test)
      || expressionUsesCStringCompare(statement.update)
      || statementUsesCStringCompare(statement.body)
  }

  if (statement.type === 'ForOfStatement') {
    return expressionUsesCStringCompare(statement.iterable) || statementUsesCStringCompare(statement.body)
  }

  if (statement.type === 'SwitchStatement') {
    return expressionUsesCStringCompare(statement.discriminant)
      || statement.cases.some(item => expressionUsesCStringCompare(item.test) || item.consequent.some(child => statementUsesCStringCompare(child)))
  }

  if (statement.type === 'TryStatement') {
    return statementUsesCStringCompare(statement.block)
      || (statement.handler != null && statementUsesCStringCompare(statement.handler.body))
      || (statement.finalizer != null && statementUsesCStringCompare(statement.finalizer))
  }

  return false
}

function expressionUsesCRuntime(expression) {
  if (expression == null) {
    return false
  }

  if (isErrorConstructorExpression(expression)) {
    return true
  }

  if (expression.type === 'NewExpression' && collectionConstructorName(expression) != null) {
    return true
  }

  if (expression.type === 'ObjectLiteral') {
    return true
  }

  if (expression.type === 'ArrayLiteral') {
    return true
  }

  if (expression.type === 'MemberExpression' || expression.type === 'OptionalMemberExpression') {
    return expressionUsesCRuntime(expression.object)
  }

  if (expression.type === 'IndexExpression' || expression.type === 'OptionalIndexExpression') {
    return expressionUsesCRuntime(expression.object) || expressionUsesCRuntime(expression.index)
  }

  if (expression.type === 'CallExpression' || expression.type === 'OptionalCallExpression' || expression.type === 'NewExpression') {
    if (expression.type === 'CallExpression' && isCollectionMethodCallName(expression)) {
      return true
    }

    if (expression.type === 'CallExpression' && expression.callee.type === 'Reference' && expression.callee.path.length === 1 && expression.callee.path[0] === 'String') {
      return true
    }

    if (expression.type === 'CallExpression' && expression.callee.type === 'MemberExpression' && isCStringRuntimeMethodName(expression.callee.property)) {
      return true
    }

    return expressionUsesCRuntime(expression.callee) || expression.args.some(arg => expressionUsesCRuntime(arg))
  }

  if (expression.type === 'AssignmentExpression') {
    return expressionUsesCRuntime(expression.target) || expressionUsesCRuntime(expression.value)
  }

  if (expression.type === 'BinaryExpression') {
    if (expression.operator === '+' && expression.valueType === 'string') {
      return true
    }

    return expressionUsesCRuntime(expression.left) || expressionUsesCRuntime(expression.right)
  }

  if (expression.type === 'UnaryExpression' || expression.type === 'AwaitExpression') {
    return expressionUsesCRuntime(expression.argument)
  }

  if (expression.type === 'ObjectLiteral') {
    return true
  }

  if (expression.type === 'ArrowFunctionExpression') {
    return expression.expressionBody
      ? expressionUsesCRuntime(expression.body)
      : expression.body.some(statement => statementUsesCRuntime(statement))
  }

  return false
}

function expressionUsesCCallbackRuntime(expression) {
  if (expression == null) {
    return false
  }

  if (expression.type === 'MemberExpression' || expression.type === 'OptionalMemberExpression') {
    return expressionUsesCCallbackRuntime(expression.object)
  }

  if (expression.type === 'IndexExpression' || expression.type === 'OptionalIndexExpression') {
    return expressionUsesCCallbackRuntime(expression.object) || expressionUsesCCallbackRuntime(expression.index)
  }

  if (expression.type === 'OptionalCallExpression') {
    return true
  }

  if (expression.type === 'CallExpression' || expression.type === 'NewExpression') {
    return expressionUsesCCallbackRuntime(expression.callee) || expression.args.some(arg => expressionUsesCCallbackRuntime(arg))
  }

  if (expression.type === 'AssignmentExpression') {
    return expressionUsesCCallbackRuntime(expression.target) || expressionUsesCCallbackRuntime(expression.value)
  }

  if (expression.type === 'BinaryExpression') {
    return expressionUsesCCallbackRuntime(expression.left) || expressionUsesCCallbackRuntime(expression.right)
  }

  if (expression.type === 'UnaryExpression' || expression.type === 'AwaitExpression') {
    return expressionUsesCCallbackRuntime(expression.argument)
  }

  if (expression.type === 'ArrayLiteral') {
    return expression.elements.some(element => expressionUsesCCallbackRuntime(element))
  }

  if (expression.type === 'ObjectLiteral') {
    return expression.properties.some(property => expressionUsesCCallbackRuntime(property.value))
  }

  if (expression.type === 'ArrowFunctionExpression') {
    return expression.expressionBody
      ? expressionUsesCCallbackRuntime(expression.body)
      : expression.body.some(statement => statementUsesCCallbackRuntime(statement))
  }

  return false
}

function expressionUsesCTimeRuntime(expression) {
  if (expression == null) {
    return false
  }

  if (expression.type === 'CallExpression' && cTimeRuntimeCallName(expression.callee) != null) {
    return true
  }

  if (expression.type === 'MemberExpression' || expression.type === 'OptionalMemberExpression') {
    return expressionUsesCTimeRuntime(expression.object)
  }

  if (expression.type === 'IndexExpression' || expression.type === 'OptionalIndexExpression') {
    return expressionUsesCTimeRuntime(expression.object) || expressionUsesCTimeRuntime(expression.index)
  }

  if (expression.type === 'CallExpression' || expression.type === 'OptionalCallExpression' || expression.type === 'NewExpression') {
    return expressionUsesCTimeRuntime(expression.callee) || expression.args.some(arg => expressionUsesCTimeRuntime(arg))
  }

  if (expression.type === 'AssignmentExpression') {
    return expressionUsesCTimeRuntime(expression.target) || expressionUsesCTimeRuntime(expression.value)
  }

  if (expression.type === 'BinaryExpression') {
    return expressionUsesCTimeRuntime(expression.left) || expressionUsesCTimeRuntime(expression.right)
  }

  if (expression.type === 'UnaryExpression' || expression.type === 'AwaitExpression') {
    return expressionUsesCTimeRuntime(expression.argument)
  }

  if (expression.type === 'ArrowFunctionExpression') {
    return expression.expressionBody
      ? expressionUsesCTimeRuntime(expression.body)
      : expression.body.some(statement => statementUsesCTimeRuntime(statement))
  }

  return false
}

function expressionUsesCStringCompare(expression) {
  if (expression == null) {
    return false
  }

  if (expression.type === 'BinaryExpression') {
    const isStringEquality = ['===', '!==', '==', '!='].includes(expression.operator)
      && (expressionMayBeCStringCompareOperand(expression.left) || expressionMayBeCStringCompareOperand(expression.right))

    return isStringEquality
      || expressionUsesCStringCompare(expression.left)
      || expressionUsesCStringCompare(expression.right)
  }

  if (expression.type === 'MemberExpression' || expression.type === 'OptionalMemberExpression') {
    return expressionUsesCStringCompare(expression.object)
  }

  if (expression.type === 'IndexExpression' || expression.type === 'OptionalIndexExpression') {
    return expressionUsesCStringCompare(expression.object) || expressionUsesCStringCompare(expression.index)
  }

  if (expression.type === 'CallExpression' || expression.type === 'OptionalCallExpression' || expression.type === 'NewExpression') {
    return expressionUsesCStringCompare(expression.callee) || expression.args.some(arg => expressionUsesCStringCompare(arg))
  }

  if (expression.type === 'AssignmentExpression') {
    return expressionUsesCStringCompare(expression.target) || expressionUsesCStringCompare(expression.value)
  }

  if (expression.type === 'UnaryExpression' || expression.type === 'AwaitExpression') {
    return expressionUsesCStringCompare(expression.argument)
  }

  if (expression.type === 'ArrayLiteral') {
    return expression.elements.some(element => expressionUsesCStringCompare(element))
  }

  if (expression.type === 'ObjectLiteral') {
    return expression.properties.some(property => expressionUsesCStringCompare(property.value))
  }

  if (expression.type === 'ArrowFunctionExpression') {
    return expression.expressionBody
      ? expressionUsesCStringCompare(expression.body)
      : expression.body.some(statement => statementUsesCStringCompare(statement))
  }

  return false
}

function expressionMayBeCStringCompareOperand(expression) {
  if (expression == null) {
    return false
  }

  if (expression.valueType === 'string') {
    return true
  }

  return ['Reference', 'MemberExpression', 'IndexExpression', 'CallExpression'].includes(expression.type)
}

function isCollectionMethodCallName(expression) {
  return expression.callee.type === 'MemberExpression'
    && ['add', 'clear', 'delete', 'get', 'has', 'set'].includes(expression.callee.property)
}

function nodeUsesCStringLength(node) {
  if (node == null) {
    return false
  }

  if (Array.isArray(node)) {
    return node.some(item => nodeUsesCStringLength(item))
  }

  if (typeof node !== 'object') {
    return false
  }

  if (node.type === 'MemberExpression' && node.property === 'length' && expressionMayBeCStringLengthOperand(node.object)) {
    return true
  }

  return Object.entries(node)
    .filter(([key]) => key !== 'loc')
    .some(([, value]) => nodeUsesCStringLength(value))
}

function nodeUsesCStringMethodCall(node) {
  if (node == null) {
    return false
  }

  if (Array.isArray(node)) {
    return node.some(item => nodeUsesCStringMethodCall(item))
  }

  if (typeof node !== 'object') {
    return false
  }

  if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression' && isCStringRuntimeMethodName(node.callee.property)) {
    return true
  }

  return Object.entries(node)
    .filter(([key]) => key !== 'loc')
    .some(([, value]) => nodeUsesCStringMethodCall(value))
}

function nodeUsesCStringConversion(node) {
  if (node == null) {
    return false
  }

  if (Array.isArray(node)) {
    return node.some(item => nodeUsesCStringConversion(item))
  }

  if (typeof node !== 'object') {
    return false
  }

  if (node.type === 'CallExpression' && node.callee.type === 'Reference' && node.callee.path.length === 1 && node.callee.path[0] === 'String') {
    return true
  }

  return Object.entries(node)
    .filter(([key]) => key !== 'loc')
    .some(([, value]) => nodeUsesCStringConversion(value))
}

function expressionMayBeCStringLengthOperand(expression) {
  if (expression == null) {
    return false
  }

  if (expression.valueType === 'string') {
    return true
  }

  return ['StringLiteral', 'TemplateLiteral', 'Reference', 'MemberExpression', 'IndexExpression', 'CallExpression', 'BinaryExpression'].includes(expression.type)
}

function isCStringRuntimeMethodName(name) {
  return name === 'trim' || name === 'slice' || cStringPredicateMethods.has(name)
}

function withVariableScope(context, callback) {
  const previous = context.variables
  const previousArrayShapes = context.arrayShapes
  const previousBoxedVariables = context.boxedVariables
  const previousErrorObjectNames = context.errorObjectNames
  const previousFunctionTypes = context.functionTypes
  const previousMapTypes = context.mapTypes
  const previousNarrowedNullableScalars = context.narrowedNullableScalars
  const previousNullableVariables = context.nullableVariables
  const previousObjectShapes = context.objectShapes
  const previousRuntimeCallbacks = context.runtimeCallbacks
  const previousRuntimeArrayElementTypes = context.runtimeArrayElementTypes
  const previousSetElementTypes = context.setElementTypes
  const previousRuntimeStrings = context.runtimeStrings
  context.variables = new Map(previous)
  context.arrayShapes = new Map(previousArrayShapes)
  context.boxedVariables = new Set(previousBoxedVariables)
  context.errorObjectNames = new Set(previousErrorObjectNames)
  context.functionTypes = new Map(previousFunctionTypes)
  context.mapTypes = new Map(previousMapTypes)
  context.narrowedNullableScalars = new Set(previousNarrowedNullableScalars)
  context.nullableVariables = new Set(previousNullableVariables)
  context.objectShapes = new Map(previousObjectShapes)
  context.runtimeCallbacks = new Set(previousRuntimeCallbacks)
  context.runtimeArrayElementTypes = new Map(previousRuntimeArrayElementTypes)
  context.setElementTypes = new Map(previousSetElementTypes)
  context.runtimeStrings = new Set(previousRuntimeStrings)

  try {
    return callback()
  } finally {
    context.variables = previous
    context.arrayShapes = previousArrayShapes
    context.boxedVariables = previousBoxedVariables
    context.errorObjectNames = previousErrorObjectNames
    context.functionTypes = previousFunctionTypes
    context.mapTypes = previousMapTypes
    context.narrowedNullableScalars = previousNarrowedNullableScalars
    context.nullableVariables = previousNullableVariables
    context.objectShapes = previousObjectShapes
    context.runtimeCallbacks = previousRuntimeCallbacks
    context.runtimeArrayElementTypes = previousRuntimeArrayElementTypes
    context.setElementTypes = previousSetElementTypes
    context.runtimeStrings = previousRuntimeStrings
  }
}

function withNullableScalarNarrowing(context, names, callback) {
  if (names.length === 0) {
    return callback()
  }

  const previous = context.narrowedNullableScalars
  context.narrowedNullableScalars = new Set(previous)

  for (const name of names) {
    context.narrowedNullableScalars.add(name)
  }

  try {
    return callback()
  } finally {
    context.narrowedNullableScalars = previous
  }
}

function narrowNullableScalars(context, names) {
  for (const name of names) {
    context.narrowedNullableScalars.add(name)
  }
}

function escapeCString(value) {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('\n', '\\n')
    .replaceAll('\r', '\\r')
    .replaceAll('\t', '\\t')
}
