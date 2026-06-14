import type { AnyNode } from '../types.ts'
import { indent } from './format.ts'
import { emitArrowFunctionParams, emitArrowReturnTypeAnnotation } from './types.ts'
import type { JsEmitOptions } from './types.ts'

export type JsStatementEmitter = (statement: AnyNode, options?: JsEmitOptions) => string[]

export type JsExpressionEmitContext = {
  emitStatement?: JsStatementEmitter
}

export function emitExpression(
  expression: AnyNode,
  options: JsEmitOptions = {},
  context: JsExpressionEmitContext = {}
): string {
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
      return `ccjsStringLength(${emitExpression(expression.object, options, context)})`
    }

    return `${emitExpression(expression.object, options, context)}.${expression.property}`
  }

  if (expression.type === 'IndexExpression') {
    if (isMapIndexGet(expression)) {
      return `ccjsMapGet(${emitExpression(expression.object, options, context)}, ${emitExpression(expression.index, options, context)})`
    }

    return `${emitExpression(expression.object, options, context)}[${emitExpression(expression.index, options, context)}]`
  }

  if (expression.type === 'OptionalMemberExpression') {
    return `${emitExpression(expression.object, options, context)}?.${expression.property}`
  }

  if (expression.type === 'OptionalIndexExpression') {
    return `${emitExpression(expression.object, options, context)}?.[${emitExpression(expression.index, options, context)}]`
  }

  if (expression.type === 'OptionalCallExpression') {
    return `${emitExpression(expression.callee, options, context)}?.(${expression.args.map((arg) => emitExpression(arg, options, context)).join(', ')})`
  }

  if (expression.type === 'CallExpression') {
    const fsRuntimeCall = emitFsRuntimeCallExpression(expression, options, context)

    if (fsRuntimeCall != null) {
      return fsRuntimeCall
    }

    if (isArrayPopCall(expression)) {
      return `ccjsArrayPop(${emitExpression(expression.callee.object, options, context)})`
    }

    if (isMapGetCall(expression)) {
      return `ccjsMapGet(${emitExpression(expression.callee.object, options, context)}, ${emitExpression(expression.args[0], options, context)})`
    }

    if (isNumberConversionCall(expression)) {
      return `ccjsNumberFromString(${emitExpression(expression.args[0], options, context)})`
    }

    if (isNumericCastCall(expression)) {
      return `${numericCastHelperName(expression.numericCast ?? expression.callee.path[0])}(${emitExpression(expression.args[0], options, context)})`
    }

    if (isStringSliceCall(expression)) {
      const args = expression.args.map((arg) => emitExpression(arg, options, context))

      if (args.length === 1) {
        args.push('null')
      }

      return `ccjsStringSlice(${emitExpression(expression.callee.object, options, context)}, ${args.join(', ')})`
    }

    if (isStringSplitCall(expression)) {
      return `ccjsStringSplit(${emitExpression(expression.callee.object, options, context)}, ${emitExpression(expression.args[0], options, context)})`
    }

    return `${emitExpression(expression.callee, options, context)}(${expression.args.map((arg) => emitExpression(arg, options, context)).join(', ')})`
  }

  if (expression.type === 'NewExpression') {
    return `new ${emitExpression(expression.callee, options, context)}(${expression.args.map((arg) => emitExpression(arg, options, context)).join(', ')})`
  }

  if (expression.type === 'AwaitExpression') {
    return `await ${emitExpression(expression.argument, options, context)}`
  }

  if (expression.type === 'ArrowFunctionExpression') {
    const params = emitArrowFunctionParams(expression, options)
    const returnType = emitArrowReturnTypeAnnotation(expression, options)

    if (expression.expressionBody) {
      return `${params}${returnType} => ${emitExpression(expression.body, options, context)}`
    }

    const emitStatement = context.emitStatement

    if (emitStatement == null) {
      throw new Error('JS block arrow expression emission requires a statement emitter')
    }

    return `${params}${returnType} => {\n${indent(expression.body.flatMap((statement) => emitStatement(statement, options))).join('\n')}\n}`
  }

  if (expression.type === 'AssignmentExpression') {
    if (isMapIndexSet(expression)) {
      return `ccjsMapSet(${emitExpression(expression.target.object, options, context)}, ${emitExpression(expression.target.index, options, context)}, ${emitExpression(expression.value, options, context)})`
    }

    return `${emitExpression(expression.target, options, context)} = ${emitExpression(expression.value, options, context)}`
  }

  if (expression.type === 'UpdateExpression') {
    const argument = emitExpression(expression.argument, options, context)

    return expression.prefix ? `${expression.operator}${argument}` : `${argument}${expression.operator}`
  }

  if (expression.type === 'BinaryExpression') {
    return `(${emitExpression(expression.left, options, context)} ${emitJsOperator(expression.operator)} ${emitExpression(expression.right, options, context)})`
  }

  if (expression.type === 'UnaryExpression') {
    return `(${expression.operator}${emitExpression(expression.argument, options, context)})`
  }

  if (expression.type === 'ArrayLiteral') {
    return `[${expression.elements.map((element) => emitExpression(element, options, context)).join(', ')}]`
  }

  if (expression.type === 'ObjectLiteral') {
    return `{ ${expression.properties.map((property) => emitObjectProperty(property, options, context)).join(', ')} }`
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

function emitObjectProperty(property: AnyNode, options: JsEmitOptions, context: JsExpressionEmitContext): string {
  return `${emitObjectKey(property.key)}: ${emitExpression(property.value, options, context)}`
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

function emitFsRuntimeCallExpression(
  expression: AnyNode,
  options: JsEmitOptions,
  context: JsExpressionEmitContext
): string | null {
  if (expression.fsRuntimeMethod === 'stat' || expression.fsRuntimeMethod === 'lstat') {
    return `fs.${expression.fsRuntimeMethod}(${emitExpression(expression.args[0], options, context)})`
  }

  if (expression.fsRuntimeMethod === 'realpath' || expression.fsRuntimeMethod === 'readlink') {
    return `fs.${expression.fsRuntimeMethod}(${emitExpression(expression.args[0], options, context)})`
  }

  if (expression.fsRuntimeMethod === 'access') {
    return `fs.access(${expression.args.map((arg) => emitExpression(arg, options, context)).join(', ')})`
  }

  if (['appendFile', 'appendFileBytes', 'copyFile'].includes(expression.fsRuntimeMethod ?? '')) {
    const method = expression.fsRuntimeMethod === 'appendFileBytes' ? 'appendFile' : expression.fsRuntimeMethod

    return `fs.${method}(${expression.args.map((arg) => emitExpression(arg, options, context)).join(', ')})`
  }

  if (['mkdir', 'rename', 'rm', 'symlink', 'unlink'].includes(expression.fsRuntimeMethod ?? '')) {
    return `fs.${expression.fsRuntimeMethod}(${expression.args.map((arg) => emitExpression(arg, options, context)).join(', ')})`
  }

  if (expression.fsRuntimeMethod === 'readFile') {
    const args =
      expression.args.length === 1
        ? [emitExpression(expression.args[0], options, context), "'utf8'"]
        : expression.args.map((arg) => emitExpression(arg, options, context))

    return `fs.readFile(${args.join(', ')})`
  }

  if (expression.fsRuntimeMethod === 'readFileBytes') {
    return `fs.readFile(${emitExpression(expression.args[0], options, context)})`
  }

  if (expression.fsRuntimeMethod === 'readDir') {
    return `fs.readdir(${expression.args.map((arg) => emitExpression(arg, options, context)).join(', ')})`
  }

  if (expression.fsRuntimeMethod === 'readDirDirents') {
    return `fs.readdir(${expression.args.map((arg) => emitExpression(arg, options, context)).join(', ')})`
  }

  if (expression.fsRuntimeMethod === 'writeFile') {
    return `fs.writeFile(${expression.args.map((arg) => emitExpression(arg, options, context)).join(', ')})`
  }

  if (expression.fsRuntimeMethod === 'writeFileBytes') {
    return `fs.writeFile(${expression.args.map((arg) => emitExpression(arg, options, context)).join(', ')})`
  }

  if (expression.fsRuntimeMethod === 'statSync' || expression.fsRuntimeMethod === 'lstatSync') {
    return `ccjsFsSync.${expression.fsRuntimeMethod}(${emitExpression(expression.args[0], options, context)})`
  }

  if (expression.fsRuntimeMethod === 'realpathSync' || expression.fsRuntimeMethod === 'readlinkSync') {
    return `ccjsFsSync.${expression.fsRuntimeMethod}(${emitExpression(expression.args[0], options, context)})`
  }

  if (expression.fsRuntimeMethod === 'accessSync') {
    return `ccjsFsSync.accessSync(${expression.args.map((arg) => emitExpression(arg, options, context)).join(', ')})`
  }

  if (['appendFileSync', 'appendFileBytesSync', 'copyFileSync'].includes(expression.fsRuntimeMethod ?? '')) {
    const method = expression.fsRuntimeMethod === 'appendFileBytesSync' ? 'appendFileSync' : expression.fsRuntimeMethod

    return `ccjsFsSync.${method}(${expression.args.map((arg) => emitExpression(arg, options, context)).join(', ')})`
  }

  if (['mkdirSync', 'renameSync', 'rmSync', 'symlinkSync', 'unlinkSync'].includes(expression.fsRuntimeMethod ?? '')) {
    return `ccjsFsSync.${expression.fsRuntimeMethod}(${expression.args.map((arg) => emitExpression(arg, options, context)).join(', ')})`
  }

  if (expression.fsRuntimeMethod === 'readFileSync') {
    return `ccjsFsSync.readFileSync(${expression.args.map((arg) => emitExpression(arg, options, context)).join(', ')})`
  }

  if (expression.fsRuntimeMethod === 'readFileBytesSync') {
    return `ccjsFsSync.readFileSync(${emitExpression(expression.args[0], options, context)})`
  }

  if (expression.fsRuntimeMethod === 'readDirSync') {
    return `ccjsFsSync.readdirSync(${expression.args.map((arg) => emitExpression(arg, options, context)).join(', ')})`
  }

  if (expression.fsRuntimeMethod === 'readDirDirentsSync') {
    return `ccjsFsSync.readdirSync(${expression.args.map((arg) => emitExpression(arg, options, context)).join(', ')})`
  }

  if (expression.fsRuntimeMethod === 'writeFileSync') {
    return `ccjsFsSync.writeFileSync(${expression.args.map((arg) => emitExpression(arg, options, context)).join(', ')})`
  }

  if (expression.fsRuntimeMethod === 'writeFileBytesSync') {
    return `ccjsFsSync.writeFileSync(${expression.args.map((arg) => emitExpression(arg, options, context)).join(', ')})`
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
