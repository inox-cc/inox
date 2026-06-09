import { CompileError, diagnostic } from './diagnostics.ts'
import type { AnyNode, Diagnostic, ModuleGraph, ProgramNode } from './types.ts'

const cJsGlobalRoots = new Set([
  'Array',
  'Buffer',
  'Date',
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
  const needsRuntime = programs.some(usesCRuntime)
  const needsTimeRuntime = programs.some(usesCTimeRuntime)
  reportUnsupportedClasses(programs, diagnostics)
  reportUnsupportedAsync(programs, diagnostics)
  const lines = emitCPrelude(needsRuntime, needsTimeRuntime)

  for (const item of functions) {
    lines.push(`${emitFunctionHead(item, baseContext)};`)
  }

  if (functions.length > 0) {
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

function emitCPrelude(needsRuntime, needsTimeRuntime) {
  const lines = [
    '#include <stdio.h>'
  ]

  if (needsRuntime) {
    lines.push('#include <stdlib.h>')
    lines.push('#include "ccjs/array.h"')
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
    } else {
      context.variables.set(param.name, param.valueType)
    }
  }

  const bodyLines: string[] = []

  bodyLines.push(...emitStringParamPrelude(statement.params, context).map(line => `  ${line}`))

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

    if (param.valueType === 'function') {
      return emitFunctionPointerParameter(param.name, param.functionType, context, param.loc)
    }

    return `${emitCType(param.valueType)} ${param.name}`
  }).join(', ')

  return `${emitCReturnType(statement.returnType)} ${name}(${params === '' ? 'void' : params})`
}

function emitFunctionPointerParameter(name, functionType, context, loc) {
  reportUnsupportedCFunctionType(functionType, context, loc)

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

  if (functionType.returnType === 'void' && functionType.params.every(param => ['number', 'boolean'].includes(param.valueType))) {
    return
  }

  context.diagnostics.push(diagnostic('CCJS_C_FUNCTION_VALUE', 'typed C callbacks currently support only void callbacks with number/boolean parameters', loc))
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
    objectShapes: new Map(),
    ownedValues: [],
    runtimeStrings: new Set(),
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

function emitStringParamPrelude(params, context) {
  return params.flatMap(param => {
    if (param.valueType !== 'string') {
      return []
    }

    const paramName = emitCStringParamName(param.name)

    return [
      emitRuntimeTypeCheck(`${paramName}.tag != CCJS_TAG_STRING || ${paramName}.as.ref == 0`, context),
      `ccjs_string* ${param.name} = (ccjs_string*)${paramName}.as.ref;`
    ]
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

  if (statement.type === 'BreakStatement') {
    return ['break;']
  }

  if (statement.type === 'VariableDeclaration') {
    if (statement.init?.type === 'ObjectLiteral') {
      return emitObjectVariableDeclaration(statement, context)
    }

    if (statement.init?.type === 'ArrayLiteral') {
      return emitArrayVariableDeclaration(statement, context)
    }

    if (statement.init?.type === 'MemberExpression') {
      const member = resolveKnownObjectMember(statement.init, context)

      if (member != null) {
        return emitKnownObjectMemberVariableDeclaration(statement, member, context)
      }
    }

    if (statement.init?.type === 'IndexExpression') {
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

    return [
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

  if (!['number', 'boolean'].includes(elementType)) {
    context.diagnostics.push(diagnostic('CCJS_C_FOR_OF', 'C for...of currently supports only uniform number/boolean arrays', statement.loc))
    return []
  }

  const index = nextCName(context, 'ccjs_for_index')
  const value = nextCName(context, 'ccjs_for_value')
  const loopValue = elementType === 'boolean' ? `((double)(${value}.as.boolean ? 1 : 0))` : `${value}.as.number`

  registerOwnedValue(context, value)

  return withVariableScope(context, () => {
    context.variables.set(statement.name, elementType)
    const body = withVariableScope(context, () => emitStatementBody(statement.body, context))

    return [
      ...setup,
      `for (size_t ${index} = 0; ${index} < ${array.elements.length}; ${index} += 1) {`,
      ...emitPrepareOwnedValueWrite(value).map(line => `  ${line}`),
      `  ${emitStatusCheck(`ccjs_array_get(${array.name}, ${index}, &${value})`, context)}`,
      `  double ${statement.name} = ${loopValue};`,
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

  if (statement.init?.type === 'MemberExpression') {
    const member = resolveKnownObjectMember(statement.init, context)

    if (member != null) {
      return {
        lines: emitKnownObjectMemberVariableDeclaration(statement, member, context),
        expression: ''
      }
    }
  }

  if (statement.init?.type === 'IndexExpression') {
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

  if (expression?.type === 'MemberExpression') {
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

  if (expression?.type === 'IndexExpression') {
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

  lines.push(`printf("${escapeCString(parts.join(' '))}\\n", ${values.join(', ')});`)

  return lines
}

function emitConsoleLogValue(expression, context) {
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

  if (expression?.type === 'MemberExpression') {
    const member = resolveKnownObjectMember(expression, context)

    if (member?.valueType === 'string') {
      return emitRuntimeStringLogValue(temp => `ccjs_object_get_known(${member.objectName}, ${member.index}, &${temp})`, context)
    }
  }

  if (expression?.type === 'IndexExpression') {
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
  if (expression?.type === 'MemberExpression') {
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

  if (expression?.type === 'IndexExpression') {
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

  if (expression?.type === 'MemberExpression') {
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
    if (inferExpressionType(expression.left, context) === 'string' || inferExpressionType(expression.right, context) === 'string') {
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

  if (expression?.type === 'MemberExpression') {
    const member = resolveKnownObjectMember(expression, context)

    if (member != null && ['number', 'boolean'].includes(member.valueType)) {
      context.diagnostics.push(diagnostic('CCJS_C_UNSUPPORTED_EXPR', 'object field access must be assigned before it can be used by the current C backend slice', expression.loc))
      return {
        lines: [],
        expression: '0'
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

function emitCExpression(expression, context) {
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
    } else if (params[index]?.valueType === 'function') {
      args.push(emitFunctionValueExpression(arg, context))
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
    context.diagnostics.push(diagnostic('CCJS_C_FUNCTION_VALUE', 'inline or capturing callbacks are not supported by the current C backend slice; use a named function with a supported callback signature', expression.loc))

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
    return ['===', '!==', '<', '<=', '>', '>=', '&&', '||'].includes(expression.operator) ? 'boolean' : 'number'
  }

  if (expression?.type === 'ArrayLiteral') {
    return 'array'
  }

  if (expression?.type === 'ObjectLiteral') {
    return 'object'
  }

  if (expression?.type === 'MemberExpression') {
    const length = resolveKnownArrayLength(expression, context)

    if (length != null) {
      return 'number'
    }

    return resolveKnownObjectMember(expression, context)?.valueType ?? 'number'
  }

  if (expression?.type === 'IndexExpression') {
    return resolveKnownArrayIndex(expression, context)?.valueType ?? resolveKnownObjectIndex(expression, context)?.valueType ?? 'number'
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

function resolveKnownObjectMember(expression, context) {
  if (expression?.type !== 'MemberExpression' || expression.object.type !== 'Reference' || expression.object.path.length !== 1) {
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
  if (expression?.type !== 'IndexExpression' || expression.object.type !== 'Reference' || expression.object.path.length !== 1 || expression.index.type !== 'StringLiteral') {
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
  if (context.cleanupEnabled) {
    context.usedCleanupGoto = true
    return `if (${call} != CCJS_OK) goto ccjs_cleanup;`
  }

  return `if (${call} != CCJS_OK) ${context.returnType === 'void' ? 'return;' : 'return 0;'}`
}

function emitRuntimeTypeCheck(condition, context) {
  if (context.cleanupEnabled) {
    context.usedCleanupGoto = true
    return `if (${condition}) goto ccjs_cleanup;`
  }

  return `if (${condition}) ${context.returnType === 'void' ? 'return;' : 'return 0;'}`
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

function usesCTimeRuntime(program) {
  return program.body.some(item => itemUsesCTimeRuntime(item))
}

function itemUsesCRuntime(item) {
  if (item.type === 'FunctionDeclaration') {
    return item.returnType === 'string' || item.params.some(param => param.valueType === 'string') || item.body.some(statement => statementUsesCRuntime(statement))
  }

  if (item.type === 'ClassDeclaration') {
    return item.methods.some(method => method.body.some(statement => statementUsesCRuntime(statement)))
  }

  return statementUsesCRuntime(item)
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

function statementUsesCRuntime(statement) {
  if (statement.type === 'VariableDeclaration') {
    return expressionUsesCRuntime(statement.init)
  }

  if (statement.type === 'ExpressionStatement') {
    return expressionUsesCRuntime(statement.expression)
  }

  if (statement.type === 'ReturnStatement') {
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

function withVariableScope(context, callback) {
  const previous = context.variables
  const previousArrayShapes = context.arrayShapes
  const previousObjectShapes = context.objectShapes
  const previousRuntimeStrings = context.runtimeStrings
  context.variables = new Map(previous)
  context.arrayShapes = new Map(previousArrayShapes)
  context.objectShapes = new Map(previousObjectShapes)
  context.runtimeStrings = new Set(previousRuntimeStrings)

  try {
    return callback()
  } finally {
    context.variables = previous
    context.arrayShapes = previousArrayShapes
    context.objectShapes = previousObjectShapes
    context.runtimeStrings = previousRuntimeStrings
  }
}

function escapeCString(value) {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')
}
