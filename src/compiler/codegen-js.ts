import {
  collectIrPrograms,
  collectIrTopLevelNodeEntries,
  findIrEntryProgram,
  hasIrFunctionDeclaration
} from './ir.ts'
import { emitJsPrelude } from './js/prelude.ts'
import {
  emitArrowFunctionParams,
  emitArrowReturnTypeAnnotation,
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
    if (expression.fsRuntimeConstant != null) {
      return `ccjsFsSync.constants.${expression.fsRuntimeConstant}`
    }

    if (isStringLengthExpression(expression)) {
      return `ccjsStringLength(${emitExpression(expression.object, options)})`
    }

    return `${emitExpression(expression.object, options)}.${expression.property}`
  }

  if (expression.type === 'IndexExpression') {
    if (isMapIndexGet(expression)) {
      return `ccjsMapGet(${emitExpression(expression.object, options)}, ${emitExpression(expression.index, options)})`
    }

    return `${emitExpression(expression.object, options)}[${emitExpression(expression.index, options)}]`
  }

  if (expression.type === 'OptionalMemberExpression') {
    return `${emitExpression(expression.object, options)}?.${expression.property}`
  }

  if (expression.type === 'OptionalIndexExpression') {
    return `${emitExpression(expression.object, options)}?.[${emitExpression(expression.index, options)}]`
  }

  if (expression.type === 'OptionalCallExpression') {
    return `${emitExpression(expression.callee, options)}?.(${expression.args.map((arg) => emitExpression(arg, options)).join(', ')})`
  }

  if (expression.type === 'CallExpression') {
    const fsRuntimeCall = emitFsRuntimeCallExpression(expression, options)

    if (fsRuntimeCall != null) {
      return fsRuntimeCall
    }

    if (isArrayPopCall(expression)) {
      return `ccjsArrayPop(${emitExpression(expression.callee.object, options)})`
    }

    if (isMapGetCall(expression)) {
      return `ccjsMapGet(${emitExpression(expression.callee.object, options)}, ${emitExpression(expression.args[0], options)})`
    }

    if (isNumberConversionCall(expression)) {
      return `ccjsNumberFromString(${emitExpression(expression.args[0], options)})`
    }

    if (isNumericCastCall(expression)) {
      return `${numericCastHelperName(expression.numericCast ?? expression.callee.path[0])}(${emitExpression(expression.args[0], options)})`
    }

    if (isStringSliceCall(expression)) {
      const args = expression.args.map((arg) => emitExpression(arg, options))

      if (args.length === 1) {
        args.push('null')
      }

      return `ccjsStringSlice(${emitExpression(expression.callee.object, options)}, ${args.join(', ')})`
    }

    if (isStringSplitCall(expression)) {
      return `ccjsStringSplit(${emitExpression(expression.callee.object, options)}, ${emitExpression(expression.args[0], options)})`
    }

    return `${emitExpression(expression.callee, options)}(${expression.args.map((arg) => emitExpression(arg, options)).join(', ')})`
  }

  if (expression.type === 'NewExpression') {
    return `new ${emitExpression(expression.callee, options)}(${expression.args.map((arg) => emitExpression(arg, options)).join(', ')})`
  }

  if (expression.type === 'AwaitExpression') {
    return `await ${emitExpression(expression.argument, options)}`
  }

  if (expression.type === 'ArrowFunctionExpression') {
    const params = emitArrowFunctionParams(expression, options)
    const returnType = emitArrowReturnTypeAnnotation(expression, options)

    if (expression.expressionBody) {
      return `${params}${returnType} => ${emitExpression(expression.body, options)}`
    }

    return `${params}${returnType} => {\n${indent(expression.body.flatMap((statement) => emitStatement(statement, options))).join('\n')}\n}`
  }

  if (expression.type === 'AssignmentExpression') {
    if (isMapIndexSet(expression)) {
      return `ccjsMapSet(${emitExpression(expression.target.object, options)}, ${emitExpression(expression.target.index, options)}, ${emitExpression(expression.value, options)})`
    }

    return `${emitExpression(expression.target, options)} = ${emitExpression(expression.value, options)}`
  }

  if (expression.type === 'UpdateExpression') {
    const argument = emitExpression(expression.argument, options)

    return expression.prefix ? `${expression.operator}${argument}` : `${argument}${expression.operator}`
  }

  if (expression.type === 'BinaryExpression') {
    return `(${emitExpression(expression.left, options)} ${emitJsOperator(expression.operator)} ${emitExpression(expression.right, options)})`
  }

  if (expression.type === 'UnaryExpression') {
    return `(${expression.operator}${emitExpression(expression.argument, options)})`
  }

  if (expression.type === 'ArrayLiteral') {
    return `[${expression.elements.map((element) => emitExpression(element, options)).join(', ')}]`
  }

  if (expression.type === 'ObjectLiteral') {
    return `{ ${expression.properties.map((property) => emitObjectProperty(property, options)).join(', ')} }`
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

function emitObjectProperty(property: AnyNode, options: JsEmitOptions = {}): string {
  return `${emitObjectKey(property.key)}: ${emitExpression(property.value, options)}`
}

function emitObjectKey(key: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key)
}

function isArrayPopCall(expression: AnyNode): boolean {
  return (
    expression.type === 'CallExpression' &&
    expression.callee.type === 'MemberExpression' &&
    expression.callee.property === 'pop' &&
    expression.args.length === 0
  )
}

function isMapGetCall(expression: AnyNode): boolean {
  return (
    expression.type === 'CallExpression' &&
    expression.callee.type === 'MemberExpression' &&
    expression.callee.property === 'get' &&
    expression.nullable === true &&
    expression.args.length === 1
  )
}

function isNumberConversionCall(expression: AnyNode): boolean {
  return (
    expression.type === 'CallExpression' &&
    expression.callee.type === 'Reference' &&
    expression.callee.path.length === 1 &&
    expression.callee.path[0] === 'Number' &&
    expression.args.length === 1
  )
}

function isNumericCastCall(expression: AnyNode): boolean {
  return (
    expression.type === 'CallExpression' &&
    expression.callee.type === 'Reference' &&
    expression.callee.path.length === 1 &&
    ['i32', 'u32', 'u64', 'f32', 'f64'].includes(expression.callee.path[0]) &&
    expression.args.length === 1
  )
}

function numericCastHelperName(cast: string): string {
  if (cast === 'u32') {
    return 'ccjsU32'
  }

  if (cast === 'u64') {
    return 'ccjsU64'
  }

  if (cast === 'f32') {
    return 'ccjsF32'
  }

  if (cast === 'f64') {
    return 'ccjsF64'
  }

  return 'ccjsI32'
}

function isStringLengthExpression(expression: AnyNode): boolean {
  return (
    expression.type === 'MemberExpression' &&
    expression.property === 'length' &&
    expression.stringRuntimeMethod === 'length'
  )
}

function isStringSliceCall(expression: AnyNode): boolean {
  return (
    expression.type === 'CallExpression' &&
    expression.callee.type === 'MemberExpression' &&
    expression.stringRuntimeMethod === 'slice' &&
    expression.args.length >= 1 &&
    expression.args.length <= 2
  )
}

function isStringSplitCall(expression: AnyNode): boolean {
  return (
    expression.type === 'CallExpression' &&
    expression.callee.type === 'MemberExpression' &&
    expression.stringRuntimeMethod === 'split' &&
    expression.args.length === 1
  )
}

function emitFsRuntimeCallExpression(expression: AnyNode, options: JsEmitOptions): string | null {
  if (expression.fsRuntimeMethod === 'stat' || expression.fsRuntimeMethod === 'lstat') {
    return `fs.${expression.fsRuntimeMethod}(${emitExpression(expression.args[0], options)})`
  }

  if (expression.fsRuntimeMethod === 'realpath' || expression.fsRuntimeMethod === 'readlink') {
    return `fs.${expression.fsRuntimeMethod}(${emitExpression(expression.args[0], options)})`
  }

  if (expression.fsRuntimeMethod === 'access') {
    return `fs.access(${expression.args.map((arg) => emitExpression(arg, options)).join(', ')})`
  }

  if (['appendFile', 'appendFileBytes', 'copyFile'].includes(expression.fsRuntimeMethod ?? '')) {
    const method = expression.fsRuntimeMethod === 'appendFileBytes' ? 'appendFile' : expression.fsRuntimeMethod

    return `fs.${method}(${expression.args.map((arg) => emitExpression(arg, options)).join(', ')})`
  }

  if (['mkdir', 'rename', 'rm', 'symlink', 'unlink'].includes(expression.fsRuntimeMethod ?? '')) {
    return `fs.${expression.fsRuntimeMethod}(${expression.args.map((arg) => emitExpression(arg, options)).join(', ')})`
  }

  if (expression.fsRuntimeMethod === 'readFile') {
    const args =
      expression.args.length === 1
        ? [emitExpression(expression.args[0], options), "'utf8'"]
        : expression.args.map((arg) => emitExpression(arg, options))

    return `fs.readFile(${args.join(', ')})`
  }

  if (expression.fsRuntimeMethod === 'readFileBytes') {
    return `fs.readFile(${emitExpression(expression.args[0], options)})`
  }

  if (expression.fsRuntimeMethod === 'readDir') {
    return `fs.readdir(${expression.args.map((arg) => emitExpression(arg, options)).join(', ')})`
  }

  if (expression.fsRuntimeMethod === 'readDirDirents') {
    return `fs.readdir(${expression.args.map((arg) => emitExpression(arg, options)).join(', ')})`
  }

  if (expression.fsRuntimeMethod === 'writeFile') {
    return `fs.writeFile(${expression.args.map((arg) => emitExpression(arg, options)).join(', ')})`
  }

  if (expression.fsRuntimeMethod === 'writeFileBytes') {
    return `fs.writeFile(${expression.args.map((arg) => emitExpression(arg, options)).join(', ')})`
  }

  if (expression.fsRuntimeMethod === 'statSync' || expression.fsRuntimeMethod === 'lstatSync') {
    return `ccjsFsSync.${expression.fsRuntimeMethod}(${emitExpression(expression.args[0], options)})`
  }

  if (expression.fsRuntimeMethod === 'realpathSync' || expression.fsRuntimeMethod === 'readlinkSync') {
    return `ccjsFsSync.${expression.fsRuntimeMethod}(${emitExpression(expression.args[0], options)})`
  }

  if (expression.fsRuntimeMethod === 'accessSync') {
    return `ccjsFsSync.accessSync(${expression.args.map((arg) => emitExpression(arg, options)).join(', ')})`
  }

  if (['appendFileSync', 'appendFileBytesSync', 'copyFileSync'].includes(expression.fsRuntimeMethod ?? '')) {
    const method = expression.fsRuntimeMethod === 'appendFileBytesSync' ? 'appendFileSync' : expression.fsRuntimeMethod

    return `ccjsFsSync.${method}(${expression.args.map((arg) => emitExpression(arg, options)).join(', ')})`
  }

  if (['mkdirSync', 'renameSync', 'rmSync', 'symlinkSync', 'unlinkSync'].includes(expression.fsRuntimeMethod ?? '')) {
    return `ccjsFsSync.${expression.fsRuntimeMethod}(${expression.args.map((arg) => emitExpression(arg, options)).join(', ')})`
  }

  if (expression.fsRuntimeMethod === 'readFileSync') {
    return `ccjsFsSync.readFileSync(${expression.args.map((arg) => emitExpression(arg, options)).join(', ')})`
  }

  if (expression.fsRuntimeMethod === 'readFileBytesSync') {
    return `ccjsFsSync.readFileSync(${emitExpression(expression.args[0], options)})`
  }

  if (expression.fsRuntimeMethod === 'readDirSync') {
    return `ccjsFsSync.readdirSync(${expression.args.map((arg) => emitExpression(arg, options)).join(', ')})`
  }

  if (expression.fsRuntimeMethod === 'readDirDirentsSync') {
    return `ccjsFsSync.readdirSync(${expression.args.map((arg) => emitExpression(arg, options)).join(', ')})`
  }

  if (expression.fsRuntimeMethod === 'writeFileSync') {
    return `ccjsFsSync.writeFileSync(${expression.args.map((arg) => emitExpression(arg, options)).join(', ')})`
  }

  if (expression.fsRuntimeMethod === 'writeFileBytesSync') {
    return `ccjsFsSync.writeFileSync(${expression.args.map((arg) => emitExpression(arg, options)).join(', ')})`
  }

  return null
}

function isMapIndexGet(expression: AnyNode): boolean {
  return expression.type === 'IndexExpression' && expression.collectionKind === 'map' && expression.nullable === true
}

function isMapIndexSet(expression: AnyNode): boolean {
  return (
    expression.type === 'AssignmentExpression' &&
    expression.target?.type === 'IndexExpression' &&
    expression.target.collectionKind === 'map'
  )
}

function indent(lines: string[]): string[] {
  return lines.map((line) => `  ${line}`)
}
