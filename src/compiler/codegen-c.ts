import { CompileError, diagnostic } from './diagnostics.ts'
import type { AnyNode, Diagnostic, ModuleGraph, ProgramNode } from './types.ts'

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

export function emitC(program: ProgramNode): string {
  return emitCUnit([program], program)
}

export function emitCBundle(graph: ModuleGraph): string {
  const entryModule = graph.modules.find(module => module.path === graph.entry)

  return emitCUnit(graph.modules.map(module => module.hir).filter(program => program != null), entryModule?.hir ?? graph.modules.at(-1)?.hir ?? null)
}

function emitCUnit(programs: ProgramNode[], entryProgram: ProgramNode | null) {
  const diagnostics: Diagnostic[] = []
  const functions = collectFunctions(programs)
  const baseContext = createBaseContext(diagnostics, functions)
  baseContext.callbackWrappers = collectCallbackWrappers(programs, baseContext)
  const needsCallbackRuntime = [...baseContext.callbackWrappers.values()].some(isRuntimeCallbackWrapper) || programs.some(usesCCallbackRuntime)
  const needsRuntime = needsCallbackRuntime || programs.some(usesCRuntime)
  const needsTimeRuntime = programs.some(usesCTimeRuntime)
  const needsStringCompare = programs.some(usesCStringCompare)
  reportUnsupportedClasses(programs, diagnostics)
  reportUnsupportedAsync(programs, diagnostics)
  const lines = emitCPrelude(needsRuntime, needsTimeRuntime, needsCallbackRuntime, needsStringCompare)
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

function emitCPrelude(needsRuntime, needsTimeRuntime, needsCallbackRuntime, needsStringCompare) {
  const lines = [
    '#include <stdio.h>'
  ]

  if (needsStringCompare) {
    lines.push('#include <string.h>')
  }

  if (needsRuntime) {
    lines.push('#include <stdlib.h>')
    lines.push('#include "ccjs/array.h"')
    if (needsCallbackRuntime) {
      lines.push('#include "ccjs/callback.h"')
    }
    lines.push('#include "ccjs/object.h"')
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
  return {
    callbackArrowWrappers: new Map(),
    callbackWrappers: new Map(),
    diagnostics,
    functionNames: new Map(functions.map(item => [item.name, emitCFunctionName(item.name)])),
    functionParams: new Map(functions.map(item => [item.name, item.params])),
    functionReturnTypes: new Map(functions.map(item => [item.name, item.returnType])),
    nextId: 0
  }
}

function emitFunctionDeclaration(statement, baseContext) {
  const context = createFunctionContext(baseContext, statement.returnType)

  for (const param of statement.params) {
    if (param.valueType === 'string') {
      context.variables.set(param.name, 'string')
      context.runtimeStrings.add(param.name)
    } else if (param.valueType === 'object') {
      context.variables.set(param.name, 'object')
      registerObjectShape(context, param.name, param.shape)
    } else if (param.valueType === 'function') {
      context.variables.set(param.name, 'function')
      context.functionTypes.set(param.name, param.functionType)

      if (isRuntimeFunctionType(param.functionType)) {
        context.runtimeCallbacks.add(param.name)
      }
    } else {
      context.variables.set(param.name, param.valueType)
    }
  }

  const bodyLines: string[] = []

  bodyLines.push(...emitRuntimeParamPrelude(statement.params, context).map(line => `  ${line}`))

  for (const item of statement.body) {
    bodyLines.push(...emitStatement(item, context).map(line => `  ${line}`))
  }

  const lines = [
    `${emitFunctionHead(statement, context)} {`,
    ...emitReturnValueDeclarations(context).map(line => `  ${line}`),
    ...emitOwnedValueDeclarations(context).map(line => `  ${line}`),
    ...bodyLines
  ]

  if (shouldEmitCleanupLabel(context)) {
    lines.push('ccjs_cleanup:')
    lines.push(...emitOwnedValueCleanup(context).map(line => `  ${line}`))
    lines.push(`  ${emitCleanupReturn(context)}`)
  } else if (statement.returnType !== 'void') {
    lines.push(`  return ${statement.returnType === 'string' ? '""' : '0'};`)
  }

  lines.push('}')

  return lines
}

function emitFunctionHead(statement, context) {
  const name = context.functionNames.get(statement.name) ?? emitCFunctionName(statement.name)
  const params = statement.params.map(param => {
    if (param.valueType === 'string') {
      return `ccjs_value ${emitCStringParamName(param.name)}`
    }

    if (param.valueType === 'object') {
      return `ccjs_value ${param.name}`
    }

    if (param.valueType === 'function') {
      return emitFunctionParameter(param.name, param.functionType, context, param.loc)
    }

    return `${emitCType(param.valueType)} ${param.name}`
  }).join(', ')

  return `${emitCReturnType(statement.returnType)} ${name}(${params === '' ? 'void' : params})`
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

function isPlainFunctionPointerType(functionType) {
  return functionType == null
    || (functionType.returnType === 'void' && functionType.params.every(param => ['number', 'boolean'].includes(param.valueType)))
}

function isRuntimeFunctionType(functionType) {
  return functionType != null
    && functionType.returnType === 'void'
    && functionType.params.some(param => ['string', 'object'].includes(param.valueType))
    && functionType.params.every(param => ['number', 'boolean', 'string', 'object'].includes(param.valueType))
}

function collectCallbackWrappers(programs, context) {
  const wrappers = new Map()
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
    const wrapper = {
      kind: 'arrow',
      key,
      name: `ccjs_callback_arrow_${index}`,
      contextTypeName: `ccjs_callback_context_${index}`,
      finalizerName: `ccjs_callback_context_${index}_finalize`,
      expression,
      functionType,
      captures: collectArrowCaptures(expression, scopes, context)
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
        functionType: param.functionType,
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
      shape: statement.shape,
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
      register(statement.init, statement.functionType, scopes)
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
          register(arg, param.functionType, scopes)
        }

        visitExpression(arg, scopes)
      }

      visitExpression(expression.callee, scopes)
      return
    }

    if (expression.type === 'AssignmentExpression') {
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
  const statementLines = statements.flatMap(statement => emitStatement(statement, context))
  const lines = [
    `${emitPlainArrowCallbackWrapperHead(wrapper)} {`,
    ...emitOwnedValueDeclarations(context).map(line => `  ${line}`),
    ...statementLines.map(line => `  ${line}`)
  ]

  if (shouldEmitCleanupLabel(context)) {
    lines.push('ccjs_cleanup:')
    lines.push(...emitOwnedValueCleanup(context).map(line => `  ${line}`))
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

  lines.push(`  ${context.functionNames.get(wrapper.target) ?? emitCFunctionName(wrapper.target)}(${args.join(', ')});`)
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
  const bodyLines: string[] = []

  bodyLines.push(...emitRuntimeArrowCallbackContextLocals(wrapper, context))
  bodyLines.push(...emitRuntimeArrowCallbackParamPrelude(wrapper, context))
  const statements = wrapper.expression.expressionBody
    ? [{
        type: 'ExpressionStatement',
        expression: wrapper.expression.body
      }]
    : wrapper.expression.body
  const statementLines = statements.flatMap(statement => emitStatement(statement, context))

  lines.push(`${emitRuntimeCallbackWrapperHead(wrapper)} {`)

  if (isRuntimeArrowCallbackWrapperWithContext(wrapper)) {
    lines.push('  if (context == 0) return CCJS_ERR_TYPE;')
  } else {
    lines.push('  (void)context;')
  }

  lines.push(`  if (out == 0 || arg_count != ${wrapper.functionType.params.length}${wrapper.functionType.params.length === 0 ? '' : ' || args == 0'}) return CCJS_ERR_TYPE;`)
  lines.push('  *out = ccjs_undefined_value();')
  lines.push(...bodyLines.map(line => `  ${line}`))
  lines.push(...emitOwnedValueDeclarations(context).map(line => `  ${line}`))
  lines.push(...statementLines.map(line => `  ${line}`))
  lines.push(...emitOwnedValueCleanup(context).map(line => `  ${line}`))
  lines.push('  return CCJS_OK;')
  lines.push('}')

  return lines
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
  return capture.runtimeManaged === true && ['string', 'object'].includes(capture.valueType)
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

function createFunctionContext(baseContext, returnType) {
  return {
    ...baseContext,
    arrayShapes: new Map(),
    cleanupEnabled: true,
    functionTypes: new Map(),
    objectShapes: new Map(),
    ownedValues: [],
    runtimeCallbacks: new Set(),
    runtimeStrings: new Set(),
    statusReturn: false,
    usedCleanupGoto: false,
    variables: new Map(),
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

  for (const statement of body) {
    bodyLines.push(...emitStatement(statement, context).map(line => `  ${line}`))
  }

  lines.push(...emitOwnedValueDeclarations(context).map(line => `  ${line}`))
  lines.push(...bodyLines)

  if (shouldEmitCleanupLabel(context)) {
    lines.push('ccjs_cleanup:')
    lines.push(...emitOwnedValueCleanup(context).map(line => `  ${line}`))
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

function emitRuntimeParamPrelude(params, context) {
  return params.flatMap(param => {
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

function emitCReturnType(type) {
  if (type === 'string') {
    return 'ccjs_value'
  }

  return emitCType(type)
}

function emitStatement(statement, context) {
  if (statement.type === 'BlockStatement') {
    return withVariableScope(context, () => [
      '{',
      ...statement.body.flatMap(item => emitStatement(item, context).map(line => `  ${line}`)),
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
    context.diagnostics.push(diagnostic('CCJS_C_TRY', 'try/catch/finally is not supported by the current C backend slice', statement.loc))
    return []
  }

  if (statement.type === 'ThrowStatement') {
    context.diagnostics.push(diagnostic('CCJS_C_THROW', 'throw is not supported by the current C backend slice', statement.loc))
    return []
  }

  if (statement.type === 'BreakStatement') {
    return ['break;']
  }

  if (statement.type === 'ContinueStatement') {
    return ['continue;']
  }

  if (statement.type === 'VariableDeclaration') {
    if (statement.init?.type === 'ObjectLiteral') {
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
    if (context.returnType === 'string') {
      return emitStringReturnStatement(statement, context)
    }

    if (context.returnType !== 'void') {
      const value = statement.argument == null
        ? {
            lines: [],
            expression: '0'
          }
        : emitPreparedNumberExpression(statement.argument, context)
      context.usedCleanupGoto = true

      return [
        ...value.lines,
        `ccjs_return = ${value.expression};`,
        'goto ccjs_cleanup;'
      ]
    }

    if (statement.argument == null || context.returnType === 'void') {
      if (context.cleanupEnabled) {
        context.usedCleanupGoto = true
        return ['goto ccjs_cleanup;']
      }

      return ['return;']
    }

    return [`return ${emitCExpression(statement.argument, context)};`]
  }

  return []
}

function emitIfStatement(statement, context) {
  const condition = emitPreparedNumberExpression(statement.condition, context)
  const lines = [
    ...condition.lines,
    `if (${condition.expression}) {`,
    ...withVariableScope(context, () => emitStatementBody(statement.consequent, context)).map(line => `  ${line}`)
  ]

  if (statement.alternate == null) {
    lines.push('}')
    return lines
  }

  lines.push('} else {')
  lines.push(...withVariableScope(context, () => emitStatementBody(statement.alternate, context)).map(line => `  ${line}`))
  lines.push('}')

  return lines
}

function emitWhileStatement(statement, context) {
  const condition = emitPreparedNumberExpression(statement.condition, context)
  const body = withVariableScope(context, () => emitStatementBody(statement.body, context))

  if (condition.lines.length === 0) {
    return [
      `while (${condition.expression}) {`,
      ...body.map(line => `  ${line}`),
      '}'
    ]
  }

  return [
    'while (1) {',
    ...condition.lines.map(line => `  ${line}`),
    `  if (!(${condition.expression})) break;`,
    ...body.map(line => `  ${line}`),
    '}'
  ]
}

function emitForStatement(statement, context) {
  return withVariableScope(context, () => {
    const init = emitPreparedForInitializer(statement.init, context)
    const test = emitPreparedForExpressionClause(statement.test, context)
    const update = emitPreparedForExpressionClause(statement.update, context)
    const body = withVariableScope(context, () => emitStatementBody(statement.body, context))
    const needsPreparedLowering = init.lines.length > 0 || test.lines.length > 0 || update.lines.length > 0

    if (!needsPreparedLowering) {
      return [
        `for (${init.expression}; ${test.expression}; ${update.expression}) {`,
        ...body.map(line => `  ${line}`),
        '}'
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
    lines.push(...update.lines.map(line => `    ${line}`))

    if (update.expression !== '') {
      lines.push(`    ${update.expression};`)
    }

    lines.push('  }')
    lines.push('}')

    return lines
  })
}

function emitForOfStatement(statement, context) {
  const setup: string[] = []
  let array = resolveKnownForOfArray(statement.iterable, context)

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
    context.diagnostics.push(diagnostic('CCJS_C_FOR_OF', 'C for...of currently supports only local array variables and array literals', statement.loc))
    return []
  }

  const elementType = resolveForOfElementType(array.elements)

  if (!['number', 'boolean', 'string'].includes(elementType)) {
    context.diagnostics.push(diagnostic('CCJS_C_FOR_OF', 'C for...of currently supports only uniform number/boolean/string arrays', statement.loc))
    return []
  }

  const index = nextCName(context, 'ccjs_for_index')
  const value = nextCName(context, 'ccjs_for_value')
  const loopValue = elementType === 'boolean'
    ? `((double)(${value}.as.boolean ? 1 : 0))`
    : `${value}.as.number`

  registerOwnedValue(context, value)

  return withVariableScope(context, () => {
    context.variables.set(statement.name, elementType)
    if (elementType === 'string') {
      context.runtimeStrings.add(statement.name)
    }
    const body = withVariableScope(context, () => emitStatementBody(statement.body, context))
    const declaration = elementType === 'string'
      ? `ccjs_string* ${statement.name} = (ccjs_string*)${value}.as.ref;`
      : `double ${statement.name} = ${loopValue};`
    const checks = elementType === 'string'
      ? [emitRuntimeTypeCheck(`${value}.tag != CCJS_TAG_STRING || ${value}.as.ref == 0`, context)]
      : []

    return [
      ...setup,
      `for (size_t ${index} = 0; ${index} < ${array.elements.length}; ${index} += 1) {`,
      ...emitPrepareOwnedValueWrite(value).map(line => `  ${line}`),
      `  ${emitStatusCheck(`ccjs_array_get(${array.name}, ${index}, &${value})`, context)}`,
      ...checks.map(line => `  ${line}`),
      `  ${declaration}`,
      ...body.map(line => `  ${line}`),
      '}',
      ...emitPrepareOwnedValueWrite(value)
    ]
  })
}

function emitSwitchStatement(statement, context) {
  const discriminant = emitPreparedNumberExpression(statement.discriminant, context)
  const lines = [
    ...discriminant.lines,
    `switch ((int)${discriminant.expression}) {`
  ]

  for (const item of statement.cases) {
    lines.push(item.test == null ? '  default: {' : `  case ${emitSwitchCaseLabel(item.test, context)}: {`)
    lines.push(...withVariableScope(context, () => item.consequent.flatMap(statement => emitStatement(statement, context))).map(line => `    ${line}`))
    lines.push('  }')
  }

  lines.push('}')

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

function emitStatementBody(statement, context) {
  if (statement.type === 'BlockStatement') {
    return statement.body.flatMap(item => emitStatement(item, context))
  }

  return emitStatement(statement, context)
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

  if (statement.init?.type === 'CallExpression' && inferExpressionType(statement.init, context) === 'string') {
    return {
      lines: emitRuntimeStringVariableDeclaration(statement, statement.init, context),
      expression: ''
    }
  }

  const inferred = inferExpressionType(statement.init, context)
  context.variables.set(statement.name, inferred)

  if (inferred === 'string') {
    const runtimeString = resolveRuntimeStringReference(statement.init, context)

    if (runtimeString != null) {
      context.runtimeStrings.add(statement.name)
      return {
        lines: [],
        expression: `${statement.kind === 'const' ? 'const ' : ''}ccjs_string* ${statement.name} = ${runtimeString}`
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

function emitStringReturnStatement(statement, context) {
  if (statement.argument == null) {
    context.usedCleanupGoto = true

    return ['goto ccjs_cleanup;']
  }

  const value = emitCValueExpression(statement.argument, context)
  context.usedCleanupGoto = true

  return [
    ...value.lines,
    `ccjs_return = ${value.expression};`,
    'ccjs_retain(ccjs_return);',
    'goto ccjs_cleanup;'
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
    valueType: field.valueType
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

function emitVariableDeclaration(statement, context) {
  const inferred = inferExpressionType(statement.init, context)
  context.variables.set(statement.name, inferred)

  if (inferred === 'string') {
    const runtimeString = resolveRuntimeStringReference(statement.init, context)

    if (runtimeString != null) {
      context.runtimeStrings.add(statement.name)
      return `${statement.kind === 'const' ? 'const ' : ''}ccjs_string* ${statement.name} = ${runtimeString}`
    }

    return `${statement.kind === 'const' ? 'const ' : ''}char* ${statement.name} = ${emitStringExpression(statement.init, context)}`
  }

  if (inferred === 'function') {
    context.variables.set(statement.name, 'function')
    context.functionTypes.set(statement.name, statement.functionType)

    if (isRuntimeFunctionType(statement.functionType)) {
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
  const inferred = inferExpressionType(statement.init, context)
  context.variables.set(statement.name, inferred)

  if (inferred === 'string') {
    const runtimeString = resolveRuntimeStringReference(statement.init, context)

    if (runtimeString != null) {
      context.runtimeStrings.add(statement.name)
      return [`${statement.kind === 'const' ? 'const ' : ''}ccjs_string* ${statement.name} = ${runtimeString};`]
    }

    return [`${statement.kind === 'const' ? 'const ' : ''}char* ${statement.name} = ${emitStringExpression(statement.init, context)};`]
  }

  if (inferred === 'function') {
    context.variables.set(statement.name, 'function')
    context.functionTypes.set(statement.name, statement.functionType)

    if (isRuntimeFunctionType(statement.functionType)) {
      return emitRuntimeCallbackVariableDeclaration(statement, context)
    }

    return [`${emitFunctionPointerVariable(statement.name, statement.init, context, statement.kind === 'const', statement.functionType, statement.loc)};`]
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

function emitKnownObjectMemberVariableDeclaration(statement, member, context) {
  return emitObjectMemberVariableDeclaration(statement, member, context, temp => `ccjs_object_get_known(${member.objectName}, ${member.index}, &${temp})`)
}

function emitDynamicObjectMemberVariableDeclaration(statement, member, context) {
  return emitObjectMemberVariableDeclaration(statement, member, context, temp => `ccjs_object_get(${member.objectName}, ${cStringLiteral(member.key)}, ${utf8ByteLength(member.key)}, &${temp})`)
}

function emitObjectMemberVariableDeclaration(statement, member, context, emitGetCall) {
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
    emitStatusCheck(`ccjs_object_set_known(${member.objectName}, ${member.index}, ${value.expression})`, context)
  ]
}

function emitDynamicObjectMemberAssignment(expression, member, context) {
  const value = emitCValueExpression(expression.value, context)
  const valueType = inferExpressionType(expression.value, context)

  updateKnownObjectMemberValueType(member, valueType, context)

  return [
    ...value.lines,
    emitStatusCheck(`ccjs_object_set(${member.objectName}, ${cStringLiteral(member.key)}, ${utf8ByteLength(member.key)}, ${value.expression})`, context)
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

  if (isMemberAccessExpression(expression)) {
    const member = resolveKnownObjectMember(expression, context)

    if (member?.valueType === 'string') {
      const temp = nextCName(context, 'ccjs_value')
      registerOwnedValue(context, temp)

      return {
        lines: [
          ...emitPrepareOwnedValueWrite(temp),
          emitStatusCheck(`ccjs_object_get_known(${member.objectName}, ${member.index}, &${temp})`, context),
          emitRuntimeTypeCheck(`${temp}.tag != CCJS_TAG_STRING || ${temp}.as.ref == 0`, context)
        ],
        expression: temp
      }
    }
  }

  if (isIndexAccessExpression(expression)) {
    const element = resolveKnownArrayIndex(expression, context)

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

    if (field?.valueType === 'string') {
      const temp = nextCName(context, 'ccjs_value')
      registerOwnedValue(context, temp)

      return {
        lines: [
          ...emitPrepareOwnedValueWrite(temp),
          emitStatusCheck(`ccjs_object_get(${field.objectName}, ${cStringLiteral(field.key)}, ${utf8ByteLength(field.key)}, &${temp})`, context),
          emitRuntimeTypeCheck(`${temp}.tag != CCJS_TAG_STRING || ${temp}.as.ref == 0`, context)
        ],
        expression: temp
      }
    }
  }

  if (expression?.type === 'CallExpression' && inferExpressionType(expression, context) === 'string') {
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

  context.diagnostics.push(diagnostic('CCJS_C_UNSUPPORTED_EXPR', 'this object field expression is not supported by the current C backend slice', expression?.loc))

  return {
    lines: [],
    expression: 'ccjs_undefined_value()'
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
    const name = emitReference(expression, context)

    if (context.runtimeStrings.has(name)) {
      return {
        lines: [],
        format: '%.*s',
        values: [`(int)${name}->len`, `${name}->bytes`]
      }
    }
  }

  if (isMemberAccessExpression(expression)) {
    const member = resolveKnownObjectMember(expression, context)

    if (member?.valueType === 'string') {
      return emitRuntimeStringLogValue(temp => `ccjs_object_get_known(${member.objectName}, ${member.index}, &${temp})`, context)
    }
  }

  if (isIndexAccessExpression(expression)) {
    const element = resolveKnownArrayIndex(expression, context)

    if (element?.valueType === 'string') {
      return emitRuntimeStringLogValue(temp => `ccjs_array_get(${element.arrayName}, ${element.index}, &${temp})`, context)
    }

    const field = resolveKnownObjectIndex(expression, context)

    if (field?.valueType === 'string') {
      return emitRuntimeStringLogValue(temp => `ccjs_object_get(${field.objectName}, ${cStringLiteral(field.key)}, ${utf8ByteLength(field.key)}, &${temp})`, context)
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

  return {
    lines: [],
    format: '%s',
    values: [emitStringExpression(expression, context)]
  }
}

function emitNumberLogValue(expression, type, context) {
  if (isMemberAccessExpression(expression)) {
    const length = resolveKnownArrayLength(expression, context)

    if (length != null) {
      return {
        lines: [],
        format: '%g',
        values: [`((double)${length})`]
      }
    }

    const member = resolveKnownObjectMember(expression, context)

    if (member != null && ['number', 'boolean'].includes(member.valueType)) {
      return emitRuntimeNumberLogValue(member.valueType, temp => `ccjs_object_get_known(${member.objectName}, ${member.index}, &${temp})`, context)
    }
  }

  if (isIndexAccessExpression(expression)) {
    const element = resolveKnownArrayIndex(expression, context)

    if (element != null && ['number', 'boolean'].includes(element.valueType)) {
      return emitRuntimeNumberLogValue(element.valueType, temp => `ccjs_array_get(${element.arrayName}, ${element.index}, &${temp})`, context)
    }

    const field = resolveKnownObjectIndex(expression, context)

    if (field != null && ['number', 'boolean'].includes(field.valueType)) {
      return emitRuntimeNumberLogValue(field.valueType, temp => `ccjs_object_get(${field.objectName}, ${cStringLiteral(field.key)}, ${utf8ByteLength(field.key)}, &${temp})`, context)
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
    if (isNullishCoalescingExpression(expression)) {
      context.diagnostics.push(diagnostic('CCJS_C_NULLISH', 'nullish coalescing is not supported by the current C backend slice', expression.loc))

      return {
        lines: [],
        expression: '0'
      }
    }

    const leftType = inferExpressionType(expression.left, context)
    const rightType = inferExpressionType(expression.right, context)

    if (['===', '!=='].includes(expression.operator) && leftType === 'string' && rightType === 'string') {
      return emitPreparedStringCompareExpression(expression, context)
    }

    if (leftType === 'string' || rightType === 'string') {
      context.diagnostics.push(diagnostic('CCJS_C_STRING_EXPR', 'string binary expressions are not supported by the current C backend slice', expression.loc))

      return {
        lines: [],
        expression: '0'
      }
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
    return emitPreparedCallExpression(expression, context)
  }

  if (isMemberAccessExpression(expression)) {
    const length = resolveKnownArrayLength(expression, context)

    if (length != null) {
      return {
        lines: [],
        expression: length
      }
    }

    const member = resolveKnownObjectMember(expression, context)

    if (member != null && ['number', 'boolean'].includes(member.valueType)) {
      return emitPreparedRuntimeNumberValue(member.valueType, temp => `ccjs_object_get_known(${member.objectName}, ${member.index}, &${temp})`, context)
    }
  }

  if (isIndexAccessExpression(expression)) {
    const element = resolveKnownArrayIndex(expression, context)

    if (element != null && ['number', 'boolean'].includes(element.valueType)) {
      return emitPreparedRuntimeNumberValue(element.valueType, temp => `ccjs_array_get(${element.arrayName}, ${element.index}, &${temp})`, context)
    }

    const field = resolveKnownObjectIndex(expression, context)

    if (field != null && ['number', 'boolean'].includes(field.valueType)) {
      return emitPreparedRuntimeNumberValue(field.valueType, temp => `ccjs_object_get(${field.objectName}, ${cStringLiteral(field.key)}, ${utf8ByteLength(field.key)}, &${temp})`, context)
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

function emitPreparedStringCompareExpression(expression, context) {
  const left = emitPreparedStringCompareOperand(expression.left, context)
  const right = emitPreparedStringCompareOperand(expression.right, context)
  const equals = `(${left.length} == ${right.length} && memcmp(${left.bytes}, ${right.bytes}, ${left.length}) == 0)`

  return {
    lines: [
      ...left.lines,
      ...right.lines
    ],
    expression: expression.operator === '===' ? equals : `(!${equals})`
  }
}

function emitPreparedStringCompareOperand(expression, context) {
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
    const name = emitReference(expression, context)

    if (context.variables.get(name) === 'string') {
      if (context.runtimeStrings.has(name)) {
        return {
          lines: [],
          bytes: `${name}->bytes`,
          length: `${name}->len`
        }
      }

      return {
        lines: [],
        bytes: name,
        length: `strlen(${name})`
      }
    }
  }

  if (inferExpressionType(expression, context) === 'string') {
    const value = emitCValueExpression(expression, context)
    const string = nextCName(context, 'ccjs_cmp_string')

    return {
      lines: [
        ...value.lines,
        `ccjs_string* ${string} = (ccjs_string*)${value.expression}.as.ref;`
      ],
      bytes: `${string}->bytes`,
      length: `${string}->len`
    }
  }

  context.diagnostics.push(diagnostic('CCJS_C_STRING_EXPR', 'this string comparison operand is not supported by the current C backend slice', expression?.loc))

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
    return context.variables.has(name) ? name : context.functionNames.get(name) ?? name
  }

  context.diagnostics.push(diagnostic('CCJS_C_ASSIGNMENT_TARGET', 'this assignment target is not supported by the current C backend slice', expression?.loc))
  return '_'
}

function emitCallExpression(expression, context) {
  return `${emitCallee(expression.callee, context)}(${expression.args.map(arg => emitCExpression(arg, context)).join(', ')})`
}

function emitPreparedCallExpression(expression, context) {
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
    if (params[index]?.valueType === 'string') {
      const value = emitCValueExpression(arg, context)

      lines.push(...value.lines)
      args.push(value.expression)
    } else if (params[index]?.valueType === 'object') {
      const value = emitCValueExpression(arg, context)

      lines.push(...value.lines)
      args.push(value.expression)
    } else if (params[index]?.valueType === 'function') {
      if (isRuntimeFunctionType(params[index].functionType)) {
        const value = emitRuntimeCallbackValue(arg, params[index].functionType, context)

        lines.push(...value.lines)
        args.push(value.expression)
      } else {
        args.push(emitFunctionValueExpression(arg, context))
      }
    } else {
      args.push(emitCExpression(arg, context))
    }
  }

  return {
    lines,
    expression: `${emitCallee(expression.callee, context)}(${args.join(', ')})`
  }
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

  return isRuntimeFunctionType(functionType) ? functionType : null
}

function emitRuntimeCallbackVariableDeclaration(statement, context) {
  context.variables.set(statement.name, 'function')
  context.functionTypes.set(statement.name, statement.functionType)
  context.runtimeCallbacks.add(statement.name)
  registerOwnedValue(context, statement.name)

  return emitRuntimeCallbackValueInto(statement.init, statement.functionType, statement.name, context)
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
    if (capture.mutable) {
      context.diagnostics.push(diagnostic('CCJS_C_FUNCTION_VALUE', 'capturing mutable let bindings in C callbacks requires boxed closure storage and is not supported yet', wrapper.expression.loc))
    }

    if (!['number', 'boolean', 'string', 'object'].includes(capture.valueType)) {
      context.diagnostics.push(diagnostic('CCJS_C_FUNCTION_VALUE', 'capturing C callbacks currently support only const number/boolean/string/object bindings', wrapper.expression.loc))
    }
  }

  if (wrapper.captures.length === 0) {
    lines.push(emitStatusCheck(`ccjs_callback_new(&ccjs_default_allocator, ${wrapper.name}, 0, 0, &${out})`, context))
    return lines
  }

  const contextName = nextCName(context, 'ccjs_callback_context')

  lines.push(`${wrapper.contextTypeName}* ${contextName} = ccjs_default_alloc(0, sizeof(${wrapper.contextTypeName}), _Alignof(${wrapper.contextTypeName}));`)
  lines.push(`if (${contextName} == 0) ${emitFailureStatement(context)}`)

  for (const capture of wrapper.captures) {
    lines.push(...emitRuntimeArrowCaptureStoreLines(capture, contextName))
  }

  lines.push(`if (ccjs_callback_new(&ccjs_default_allocator, ${wrapper.name}, ${contextName}, ${wrapper.finalizerName}, &${out}) != CCJS_OK) {`)
  lines.push(`  ${wrapper.finalizerName}(${contextName});`)
  lines.push(`  ${emitFailureStatement(context)}`)
  lines.push('}')

  return lines
}

function emitRuntimeArrowCaptureStoreLines(capture, contextName) {
  const field = `${contextName}->${emitRuntimeArrowCaptureField(capture)}`

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
    if (['===', '!==', '<', '<=', '>', '>=', '&&', '||'].includes(expression.operator)) {
      return 'boolean'
    }

    if (expression.operator === '??') {
      const left = inferExpressionType(expression.left, context)

      return left === 'null' || left === 'unknown' ? inferExpressionType(expression.right, context) : left
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

    if (element != null) {
      return element.valueType
    }

    if (field != null) {
      return field.valueType
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
  if (operator === '===') {
    return '=='
  }

  if (operator === '!==') {
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
    valueType: fields[index].valueType
  }
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
    valueType: fields[index].valueType
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
    valueType: field.valueType
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

function emitPrepareOwnedValueWrite(name) {
  return [
    `ccjs_release(${name});`,
    `${name} = ccjs_undefined_value();`
  ]
}

function shouldEmitCleanupLabel(context) {
  return context.returnType !== 'void' || (context.returnType === 'void' && (context.ownedValues.length > 0 || context.usedCleanupGoto))
}

function emitReturnValueDeclarations(context) {
  if (context.returnType === 'string') {
    return ['ccjs_value ccjs_return = ccjs_undefined_value();']
  }

  if (context.returnType !== 'void') {
    return ['double ccjs_return = 0;']
  }

  return []
}

function emitOwnedValueDeclarations(context) {
  return context.ownedValues.map(name => `ccjs_value ${name} = ccjs_undefined_value();`)
}

function emitOwnedValueCleanup(context) {
  return context.ownedValues.toReversed().map(name => `ccjs_release(${name});`)
}

function emitCleanupReturn(context) {
  if (context.returnType === 'string') {
    return 'return ccjs_return;'
  }

  if (context.returnType !== 'void') {
    return 'return ccjs_return;'
  }

  return 'return;'
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

function itemUsesCRuntime(item) {
  if (item.type === 'FunctionDeclaration') {
    return item.returnType === 'string'
      || item.params.some(param => ['string', 'object'].includes(param.valueType) || (param.valueType === 'function' && isRuntimeFunctionType(param.functionType)))
      || item.body.some(statement => statementUsesCRuntime(statement))
  }

  if (item.type === 'ClassDeclaration') {
    return item.methods.some(method => method.body.some(statement => statementUsesCRuntime(statement)))
  }

  return statementUsesCRuntime(item)
}

function itemUsesCCallbackRuntime(item) {
  if (item.type === 'FunctionDeclaration') {
    return item.params.some(param => param.valueType === 'function' && isRuntimeFunctionType(param.functionType))
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
    return expressionUsesCRuntime(statement.argument)
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
    return statementUsesCRuntime(statement.block)
      || (statement.handler != null && statementUsesCRuntime(statement.handler.body))
      || (statement.finalizer != null && statementUsesCRuntime(statement.finalizer))
  }

  return false
}

function statementUsesCCallbackRuntime(statement) {
  if (statement.type === 'VariableDeclaration') {
    return (statement.valueType === 'function' && isRuntimeFunctionType(statement.functionType)) || expressionUsesCCallbackRuntime(statement.init)
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
    return expressionUsesCRuntime(expression.callee) || expression.args.some(arg => expressionUsesCRuntime(arg))
  }

  if (expression.type === 'AssignmentExpression') {
    return expressionUsesCRuntime(expression.target) || expressionUsesCRuntime(expression.value)
  }

  if (expression.type === 'BinaryExpression') {
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

  if (expression.type === 'CallExpression' || expression.type === 'OptionalCallExpression' || expression.type === 'NewExpression') {
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
    const isStringEquality = ['===', '!=='].includes(expression.operator)
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

function withVariableScope(context, callback) {
  const previous = context.variables
  const previousArrayShapes = context.arrayShapes
  const previousFunctionTypes = context.functionTypes
  const previousObjectShapes = context.objectShapes
  const previousRuntimeCallbacks = context.runtimeCallbacks
  const previousRuntimeStrings = context.runtimeStrings
  context.variables = new Map(previous)
  context.arrayShapes = new Map(previousArrayShapes)
  context.functionTypes = new Map(previousFunctionTypes)
  context.objectShapes = new Map(previousObjectShapes)
  context.runtimeCallbacks = new Set(previousRuntimeCallbacks)
  context.runtimeStrings = new Set(previousRuntimeStrings)

  try {
    return callback()
  } finally {
    context.variables = previous
    context.arrayShapes = previousArrayShapes
    context.functionTypes = previousFunctionTypes
    context.objectShapes = previousObjectShapes
    context.runtimeCallbacks = previousRuntimeCallbacks
    context.runtimeStrings = previousRuntimeStrings
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
