import type { AnyNode, ModuleGraph, ProgramNode } from './types.ts'

type JsEmitOptions = {
  callMain?: boolean
  stripExports?: boolean
}

export function emitJs(program: ProgramNode, options: JsEmitOptions = {}): string {
  const lines: string[] = emitJsPrelude([program])

  if (lines.length > 0) {
    lines.push('')
  }

  for (const item of program.body) {
    lines.push(...emitTopLevelItem(item))
  }

  if (hasMain(program) && options.callMain !== false) {
    lines.push('')
    lines.push('const ccjsMainResult = main()')
    lines.push('if (ccjsMainResult && typeof ccjsMainResult.then === \'function\') {')
    lines.push('  await ccjsMainResult')
    lines.push('}')
  }

  return `${lines.join('\n')}\n`
}

export function emitTs(program: ProgramNode, options: JsEmitOptions = {}): string {
  return emitJs(program, options)
}

export function emitJsBundle(graph: ModuleGraph, options: JsEmitOptions = {}): string {
  const programs = graph.modules.map(module => module.hir).filter((program): program is ProgramNode => program != null)
  const lines: string[] = emitJsPrelude(programs)

  if (lines.length > 0) {
    lines.push('')
  }

  for (const module of graph.modules) {
    if (module.hir == null) {
      continue
    }

    lines.push(`// ${module.path}`)
    lines.push(...emitProgramBody(module.hir, {
      stripExports: true
    }))
    lines.push('')
  }

  const entryModule = graph.modules.find(module => module.path === graph.entry)

  if (entryModule?.hir != null && hasMain(entryModule.hir) && options.callMain !== false) {
    lines.push('const ccjsMainResult = main()')
    lines.push('if (ccjsMainResult && typeof ccjsMainResult.then === \'function\') {')
    lines.push('  await ccjsMainResult')
    lines.push('}')
  }

  return `${lines.join('\n')}\n`
}

function emitProgramBody(program: ProgramNode, options: JsEmitOptions = {}): string[] {
  const lines: string[] = []

  for (const item of program.body) {
    lines.push(...emitTopLevelItem(item, options))
  }

  return lines
}

function emitJsPrelude(programs: ProgramNode[]): string[] {
  const lines: string[] = []

  if (programs.some(program => usesReferenceName(program, 'fs'))) {
    lines.push('import * as fs from \'node:fs/promises\'')
  }

  if (programs.some(program => usesReferenceName(program, 'http'))) {
    lines.push('import * as http from \'node:http\'')
  }

  return lines
}

function emitTopLevelItem(item: AnyNode, options: JsEmitOptions = {}): string[] {
  if (item.type === 'ImportDeclaration') {
    return []
  }

  if (item.type === 'FunctionDeclaration') {
    return emitFunction(item, options)
  }

  if (item.type === 'ClassDeclaration') {
    return emitClass(item, options)
  }

  return emitStatement(item, options)
}

function emitFunction(node: AnyNode, options: JsEmitOptions = {}): string[] {
  const exported = node.exported && !options.stripExports
  const head = `${exported ? 'export ' : ''}${node.async ? 'async ' : ''}function ${node.name}(${node.params.map(param => param.name).join(', ')}) {`
  const body = node.body.flatMap(statement => indent(emitStatement(statement)))

  return [
    head,
    ...body,
    '}'
  ]
}

function emitClass(node: AnyNode, options: JsEmitOptions = {}): string[] {
  const exported = node.exported && !options.stripExports
  const lines = [
    `${exported ? 'export ' : ''}class ${node.name} {`
  ]

  for (const method of node.methods) {
    lines.push(...indent(emitMethod(method)))
  }

  lines.push('}')

  return lines
}

function emitMethod(method: AnyNode): string[] {
  const head = `${method.name}(${method.params.map(param => param.name).join(', ')}) {`
  const body = method.body.flatMap(statement => indent(emitStatement(statement)))

  return [
    head,
    ...body,
    '}'
  ]
}

function emitStatement(statement: AnyNode, options: JsEmitOptions = {}): string[] {
  if (statement.type === 'BlockStatement') {
    return [
      '{',
      ...statement.body.flatMap(item => indent(emitStatement(item, options))),
      '}'
    ]
  }

  if (statement.type === 'IfStatement') {
    return emitIfStatement(statement, options)
  }

  if (statement.type === 'WhileStatement') {
    return emitWhileStatement(statement, options)
  }

  if (statement.type === 'ForStatement') {
    return emitForStatement(statement, options)
  }

  if (statement.type === 'ForOfStatement') {
    return emitForOfStatement(statement, options)
  }

  if (statement.type === 'SwitchStatement') {
    return emitSwitchStatement(statement, options)
  }

  if (statement.type === 'TryStatement') {
    return emitTryStatement(statement, options)
  }

  if (statement.type === 'BreakStatement') {
    return ['break']
  }

  if (statement.type === 'ContinueStatement') {
    return ['continue']
  }

  if (statement.type === 'VariableDeclaration') {
    const init = statement.init == null ? '' : ` = ${emitExpression(statement.init)}`
    const exported = statement.exported && !options.stripExports
    return [`${exported ? 'export ' : ''}${statement.kind} ${statement.name}${init}`]
  }

  if (statement.type === 'ExpressionStatement') {
    return [`${emitExpression(statement.expression)}`]
  }

  if (statement.type === 'ReturnStatement') {
    return [statement.argument == null ? 'return' : `return ${emitExpression(statement.argument)}`]
  }

  if (statement.type === 'ThrowStatement') {
    return [`throw ${emitExpression(statement.argument)}`]
  }

  return []
}

function emitIfStatement(statement: AnyNode, options: JsEmitOptions = {}): string[] {
  const lines = [
    `if (${emitExpression(statement.condition)}) {`,
    ...indent(emitStatementBody(statement.consequent, options))
  ]

  if (statement.alternate == null) {
    lines.push('}')
    return lines
  }

  lines.push('} else {')
  lines.push(...indent(emitStatementBody(statement.alternate, options)))
  lines.push('}')

  return lines
}

function emitWhileStatement(statement: AnyNode, options: JsEmitOptions = {}): string[] {
  return [
    `while (${emitExpression(statement.condition)}) {`,
    ...indent(emitStatementBody(statement.body, options)),
    '}'
  ]
}

function emitForStatement(statement: AnyNode, options: JsEmitOptions = {}): string[] {
  return [
    `for (${emitForInitializer(statement.init)}; ${statement.test == null ? '' : emitExpression(statement.test)}; ${statement.update == null ? '' : emitExpression(statement.update)}) {`,
    ...indent(emitStatementBody(statement.body, options)),
    '}'
  ]
}

function emitForOfStatement(statement: AnyNode, options: JsEmitOptions = {}): string[] {
  return [
    `for (${statement.kind} ${statement.name} of ${emitExpression(statement.iterable)}) {`,
    ...indent(emitStatementBody(statement.body, options)),
    '}'
  ]
}

function emitSwitchStatement(statement: AnyNode, options: JsEmitOptions = {}): string[] {
  const lines = [
    `switch (${emitExpression(statement.discriminant)}) {`
  ]

  for (const item of statement.cases) {
    lines.push(item.test == null ? '  default:' : `  case ${emitExpression(item.test)}:`)
    lines.push(...item.consequent.flatMap(statement => indent(indent(emitStatement(statement, options)))))
  }

  lines.push('}')

  return lines
}

function emitTryStatement(statement: AnyNode, options: JsEmitOptions = {}): string[] {
  const lines = [
    'try {',
    ...indent(emitStatementBody(statement.block, options))
  ]

  if (statement.handler != null) {
    lines.push(statement.handler.param == null ? '} catch {' : `} catch (${statement.handler.param}) {`)
    lines.push(...indent(emitStatementBody(statement.handler.body, options)))
  }

  if (statement.finalizer != null) {
    lines.push('} finally {')
    lines.push(...indent(emitStatementBody(statement.finalizer, options)))
  }

  lines.push('}')

  return lines
}

function emitStatementBody(statement: AnyNode, options: JsEmitOptions = {}): string[] {
  if (statement.type === 'BlockStatement') {
    return statement.body.flatMap(item => emitStatement(item, options))
  }

  return emitStatement(statement, options)
}

function emitForInitializer(init: AnyNode | null): string {
  if (init == null) {
    return ''
  }

  if (init.type === 'VariableDeclaration') {
    const value = init.init == null ? '' : ` = ${emitExpression(init.init)}`
    return `${init.kind} ${init.name}${value}`
  }

  return emitExpression(init)
}

function usesReferenceName(program: ProgramNode, name: string): boolean {
  return program.body.some(item => itemUsesReferenceName(item, name))
}

function itemUsesReferenceName(item: AnyNode, name: string): boolean {
  if (item.type === 'FunctionDeclaration') {
    return item.body.some(statement => statementUsesReferenceName(statement, name))
  }

  if (item.type === 'ClassDeclaration') {
    return item.methods.some(method => method.body.some(statement => statementUsesReferenceName(statement, name)))
  }

  return statementUsesReferenceName(item, name)
}

function statementUsesReferenceName(statement: AnyNode, name: string): boolean {
  if (statement.type === 'VariableDeclaration') {
    return statement.init != null && expressionUsesReferenceName(statement.init, name)
  }

  if (statement.type === 'ExpressionStatement') {
    return expressionUsesReferenceName(statement.expression, name)
  }

  if (statement.type === 'ReturnStatement') {
    return statement.argument != null && expressionUsesReferenceName(statement.argument, name)
  }

  if (statement.type === 'ThrowStatement') {
    return expressionUsesReferenceName(statement.argument, name)
  }

  if (statement.type === 'BlockStatement') {
    return statement.body.some(item => statementUsesReferenceName(item, name))
  }

  if (statement.type === 'IfStatement') {
    return expressionUsesReferenceName(statement.condition, name)
      || statementUsesReferenceName(statement.consequent, name)
      || (statement.alternate != null && statementUsesReferenceName(statement.alternate, name))
  }

  if (statement.type === 'WhileStatement') {
    return expressionUsesReferenceName(statement.condition, name) || statementUsesReferenceName(statement.body, name)
  }

  if (statement.type === 'ForStatement') {
    return (statement.init != null && (statement.init.type === 'VariableDeclaration' ? statementUsesReferenceName(statement.init, name) : expressionUsesReferenceName(statement.init, name)))
      || (statement.test != null && expressionUsesReferenceName(statement.test, name))
      || (statement.update != null && expressionUsesReferenceName(statement.update, name))
      || statementUsesReferenceName(statement.body, name)
  }

  if (statement.type === 'ForOfStatement') {
    return expressionUsesReferenceName(statement.iterable, name) || statementUsesReferenceName(statement.body, name)
  }

  if (statement.type === 'SwitchStatement') {
    return expressionUsesReferenceName(statement.discriminant, name)
      || statement.cases.some(item => (item.test != null && expressionUsesReferenceName(item.test, name)) || item.consequent.some(child => statementUsesReferenceName(child, name)))
  }

  if (statement.type === 'TryStatement') {
    return statementUsesReferenceName(statement.block, name)
      || (statement.handler != null && statementUsesReferenceName(statement.handler.body, name))
      || (statement.finalizer != null && statementUsesReferenceName(statement.finalizer, name))
  }

  return false
}

function expressionUsesReferenceName(expression: AnyNode, name: string): boolean {
  if (expression.type === 'Reference') {
    return expression.path[0] === name
  }

  const expressionType = expression.type ?? ''

  if (expressionType === 'ThisExpression' || expressionType.endsWith('Literal')) {
    return false
  }

  if (expression.type === 'MemberExpression' || expression.type === 'OptionalMemberExpression') {
    return expressionUsesReferenceName(expression.object, name)
  }

  if (expression.type === 'IndexExpression' || expression.type === 'OptionalIndexExpression') {
    return expressionUsesReferenceName(expression.object, name) || expressionUsesReferenceName(expression.index, name)
  }

  if (expression.type === 'CallExpression' || expression.type === 'OptionalCallExpression' || expression.type === 'NewExpression') {
    return expressionUsesReferenceName(expression.callee, name) || expression.args.some(arg => expressionUsesReferenceName(arg, name))
  }

  if (expression.type === 'AssignmentExpression') {
    return expressionUsesReferenceName(expression.target, name) || expressionUsesReferenceName(expression.value, name)
  }

  if (expression.type === 'BinaryExpression') {
    return expressionUsesReferenceName(expression.left, name) || expressionUsesReferenceName(expression.right, name)
  }

  if (expression.type === 'UnaryExpression' || expression.type === 'AwaitExpression') {
    return expressionUsesReferenceName(expression.argument, name)
  }

  if (expression.type === 'ArrayLiteral') {
    return expression.elements.some(item => expressionUsesReferenceName(item, name))
  }

  if (expression.type === 'ObjectLiteral') {
    return expression.properties.some(item => expressionUsesReferenceName(item.value, name))
  }

  if (expression.type === 'ArrowFunctionExpression') {
    return expression.expressionBody
      ? expressionUsesReferenceName(expression.body, name)
      : expression.body.some(statement => statementUsesReferenceName(statement, name))
  }

  return false
}

function emitExpression(expression: AnyNode): string {
  if (expression.type === 'StringLiteral') {
    return JSON.stringify(expression.value)
  }

  if (expression.type === 'TemplateLiteral') {
    return expression.raw
  }

  if (expression.type === 'NumberLiteral') {
    return expression.value
  }

  if (expression.type === 'BooleanLiteral') {
    return expression.value ? 'true' : 'false'
  }

  if (expression.type === 'NullLiteral') {
    return 'null'
  }

  if (expression.type === 'ThisExpression') {
    return 'this'
  }

  if (expression.type === 'Reference') {
    return expression.path.join('.')
  }

  if (expression.type === 'MemberExpression') {
    return `${emitExpression(expression.object)}.${expression.property}`
  }

  if (expression.type === 'IndexExpression') {
    return `${emitExpression(expression.object)}[${emitExpression(expression.index)}]`
  }

  if (expression.type === 'OptionalMemberExpression') {
    return `${emitExpression(expression.object)}?.${expression.property}`
  }

  if (expression.type === 'OptionalIndexExpression') {
    return `${emitExpression(expression.object)}?.[${emitExpression(expression.index)}]`
  }

  if (expression.type === 'OptionalCallExpression') {
    return `${emitExpression(expression.callee)}?.(${expression.args.map(emitExpression).join(', ')})`
  }

  if (expression.type === 'CallExpression') {
    return `${emitExpression(expression.callee)}(${expression.args.map(emitExpression).join(', ')})`
  }

  if (expression.type === 'NewExpression') {
    return `new ${emitExpression(expression.callee)}(${expression.args.map(emitExpression).join(', ')})`
  }

  if (expression.type === 'AwaitExpression') {
    return `await ${emitExpression(expression.argument)}`
  }

  if (expression.type === 'ArrowFunctionExpression') {
    const params = expression.params.length === 1
      ? expression.params[0].name
      : `(${expression.params.map(param => param.name).join(', ')})`

    if (expression.expressionBody) {
      return `${params} => ${emitExpression(expression.body)}`
    }

    return `${params} => {\n${indent(expression.body.flatMap(statement => emitStatement(statement))).join('\n')}\n}`
  }

  if (expression.type === 'AssignmentExpression') {
    return `${emitExpression(expression.target)} = ${emitExpression(expression.value)}`
  }

  if (expression.type === 'BinaryExpression') {
    return `(${emitExpression(expression.left)} ${emitJsOperator(expression.operator)} ${emitExpression(expression.right)})`
  }

  if (expression.type === 'UnaryExpression') {
    return `(${expression.operator}${emitExpression(expression.argument)})`
  }

  if (expression.type === 'ArrayLiteral') {
    return `[${expression.elements.map(emitExpression).join(', ')}]`
  }

  if (expression.type === 'ObjectLiteral') {
    return `{ ${expression.properties.map(emitObjectProperty).join(', ')} }`
  }

  return 'undefined'
}

function emitJsOperator(operator: string): string {
  if (operator === '==') {
    return '==='
  }

  if (operator === '!=') {
    return '!=='
  }

  return operator
}

function emitObjectProperty(property: AnyNode): string {
  return `${emitObjectKey(property.key)}: ${emitExpression(property.value)}`
}

function emitObjectKey(key: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key)
}

function indent(lines: string[]): string[] {
  return lines.map(line => `  ${line}`)
}

function hasMain(program: ProgramNode): boolean {
  return program.body.some(item => item.type === 'FunctionDeclaration' && item.name === 'main')
}
