import {
  collectIrPrograms,
  collectIrTopLevelNodeEntries,
  findIrEntryProgram,
  hasIrFunctionDeclaration
} from './ir.ts'
import { emitExpression as emitJsExpression } from './js/expressions.ts'
import { indent } from './js/format.ts'
import { emitJsPrelude } from './js/prelude.ts'
import {
  emitFunctionParams,
  emitReturnTypeAnnotation,
  emitTypeAlias,
  emitVariableTypeAnnotation
} from './js/types.ts'
import type { IrModuleRecord } from './ir.ts'
import type { AnyNode, IrProgram } from './types.ts'
import type { JsEmitOptions } from './js/types.ts'

export function emitJsFromIr(ir: IrProgram, options: JsEmitOptions = {}): string {
  const lines: string[] = emitJsPrelude([ir], options)

  if (lines.length > 0) {
    lines.push('')
  }

  lines.push(...emitProgramBody(ir, options))

  if (hasIrFunctionDeclaration(ir, 'main') && options.callMain !== false) {
    lines.push('')
    lines.push('const ccjsMainResult = main()')
    lines.push("if (ccjsMainResult && typeof ccjsMainResult.then === 'function') {")
    lines.push('  await ccjsMainResult')
    lines.push('}')
  }

  return `${lines.join('\n')}\n`
}

export function emitJsBundleFromIrModules(
  irModules: IrModuleRecord[],
  entry: string,
  options: JsEmitOptions = {}
): string {
  const irPrograms = collectIrPrograms(irModules)
  const entryIr = findIrEntryProgram(irModules, entry)
  const lines: string[] = emitJsPrelude(irPrograms, options)

  if (lines.length > 0) {
    lines.push('')
  }

  for (const module of irModules) {
    lines.push(`// ${module.path}`)
    lines.push(
      ...emitProgramBody(module.ir, {
        ...options,
        stripExports: true
      })
    )
    lines.push('')
  }

  if (hasIrFunctionDeclaration(entryIr, 'main') && options.callMain !== false) {
    lines.push('const ccjsMainResult = main()')
    lines.push("if (ccjsMainResult && typeof ccjsMainResult.then === 'function') {")
    lines.push('  await ccjsMainResult')
    lines.push('}')
  }

  return `${lines.join('\n')}\n`
}

function emitProgramBody(ir: IrProgram, options: JsEmitOptions = {}): string[] {
  const lines: string[] = []

  for (const entry of collectIrTopLevelNodeEntries(ir)) {
    if (entry.kind === 'import') {
      continue
    }

    if (entry.kind === 'type') {
      lines.push(...emitTypeAlias(entry.node, options))
    } else if (entry.kind === 'function') {
      lines.push(...emitFunction(entry.node, options))
    } else if (entry.kind === 'class') {
      lines.push(...emitClass(entry.node, options))
    } else {
      lines.push(...emitStatement(entry.node, options))
    }
  }

  return lines
}

function emitFunction(node: AnyNode, options: JsEmitOptions = {}): string[] {
  const exported = node.exported && !options.stripExports
  const head = `${exported ? 'export ' : ''}${node.async ? 'async ' : ''}function ${node.name}(${emitFunctionParams(node.params, options)})${emitReturnTypeAnnotation(node, options)} {`
  const body = node.body.flatMap((statement) => indent(emitStatement(statement, options)))

  return [head, ...body, '}']
}

function emitClass(node: AnyNode, options: JsEmitOptions = {}): string[] {
  const exported = node.exported && !options.stripExports
  const lines = [`${exported ? 'export ' : ''}class ${node.name} {`]

  for (const field of node.fields ?? []) {
    lines.push(...indent([emitClassField(field, options)]))
  }

  for (const method of node.methods) {
    lines.push(...indent(emitMethod(method, options)))
  }

  lines.push('}')

  return lines
}

function emitClassField(field: AnyNode, options: JsEmitOptions = {}): string {
  return field.name
}

function emitMethod(method: AnyNode, options: JsEmitOptions = {}): string[] {
  const returnType = method.name === 'constructor' ? '' : emitReturnTypeAnnotation(method, options)
  const head = `${method.name}(${emitFunctionParams(method.params, options)})${returnType} {`
  const body = method.body.flatMap((statement) => indent(emitStatement(statement, options)))

  return [head, ...body, '}']
}

function emitStatement(statement: AnyNode, options: JsEmitOptions = {}): string[] {
  if (statement.type === 'BlockStatement') {
    return ['{', ...statement.body.flatMap((item) => indent(emitStatement(item, options))), '}']
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
    const init = statement.init == null ? '' : ` = ${emitExpression(statement.init, options)}`
    const exported = statement.exported && !options.stripExports
    return [
      `${exported ? 'export ' : ''}${statement.kind} ${statement.name}${emitVariableTypeAnnotation(statement, options)}${init}`
    ]
  }

  if (statement.type === 'ExpressionStatement') {
    return [`${emitExpression(statement.expression, options)}`]
  }

  if (statement.type === 'ReturnStatement') {
    return [statement.argument == null ? 'return' : `return ${emitExpression(statement.argument, options)}`]
  }

  if (statement.type === 'ThrowStatement') {
    return [`throw ${emitExpression(statement.argument, options)}`]
  }

  return []
}

function emitIfStatement(statement: AnyNode, options: JsEmitOptions = {}): string[] {
  const lines = [
    `if (${emitExpression(statement.condition, options)}) {`,
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
    `while (${emitExpression(statement.condition, options)}) {`,
    ...indent(emitStatementBody(statement.body, options)),
    '}'
  ]
}

function emitForStatement(statement: AnyNode, options: JsEmitOptions = {}): string[] {
  return [
    `for (${emitForInitializer(statement.init, options)}; ${statement.test == null ? '' : emitExpression(statement.test, options)}; ${statement.update == null ? '' : emitExpression(statement.update, options)}) {`,
    ...indent(emitStatementBody(statement.body, options)),
    '}'
  ]
}

function emitForOfStatement(statement: AnyNode, options: JsEmitOptions = {}): string[] {
  if (isMapForOfStatement(statement)) {
    const entry = `ccjsMapEntry_${statement.name}`

    return [
      `for (const ${entry} of ${emitExpression(statement.iterable, options)}) {`,
      ...indent([
        `${statement.kind} ${statement.name} = { key: ${entry}[0], value: ${entry}[1] }`,
        ...emitStatementBody(statement.body, options)
      ]),
      '}'
    ]
  }

  return [
    `for (${statement.kind} ${statement.name} of ${emitExpression(statement.iterable, options)}) {`,
    ...indent(emitStatementBody(statement.body, options)),
    '}'
  ]
}

function isMapForOfStatement(statement: AnyNode): boolean {
  return statement.type === 'ForOfStatement' && statement.iterable?.valueType === 'map'
}

function emitSwitchStatement(statement: AnyNode, options: JsEmitOptions = {}): string[] {
  const lines = [`switch (${emitExpression(statement.discriminant, options)}) {`]

  for (const item of statement.cases) {
    lines.push(item.test == null ? '  default:' : `  case ${emitExpression(item.test, options)}:`)
    lines.push(...item.consequent.flatMap((statement) => indent(indent(emitStatement(statement, options)))))
  }

  lines.push('}')

  return lines
}

function emitTryStatement(statement: AnyNode, options: JsEmitOptions = {}): string[] {
  const lines = ['try {', ...indent(emitStatementBody(statement.block, options))]

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
    return statement.body.flatMap((item) => emitStatement(item, options))
  }

  return emitStatement(statement, options)
}

function emitForInitializer(init: AnyNode | null, options: JsEmitOptions = {}): string {
  if (init == null) {
    return ''
  }

  if (init.type === 'VariableDeclaration') {
    const value = init.init == null ? '' : ` = ${emitExpression(init.init, options)}`
    return `${init.kind} ${init.name}${emitVariableTypeAnnotation(init, options)}${value}`
  }

  return emitExpression(init, options)
}

function emitExpression(expression: AnyNode, options: JsEmitOptions = {}): string {
  return emitJsExpression(expression, options, { emitStatement })
}
