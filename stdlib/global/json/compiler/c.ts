import type { AnyNode } from '../../../../compiler/types.ts'
import type { CFunctionContext } from '../../../../compiler/c/context.ts'
import { emitFailureStatement, nextCName, registerOwnedValue } from '../../../../compiler/c/context.ts'
import { cStringLiteral, emitCIdentifier } from '../../../../compiler/c/identifiers.ts'
import { emitRuntimeValueCheckLines } from '../../../../compiler/c/runtime-values.ts'
import type {
  CObjectShape,
  CObjectShapeField,
  CPreparedCallOptions as PreparedCallOptions,
  CPreparedExpression as PreparedExpression,
  CPreparedStringBytesOperand as PreparedStringBytesOperand
} from '../../../../compiler/c/types.ts'
import { cRuntimeValueTag } from '../../../../compiler/c/value-types.ts'
import { jsonRuntimeMethodNameFromPath } from './descriptor.ts'

type JsonMemberExpressionNode = {
  object?: JsonReferenceNode | null
  property?: string | null
  type?: string | null
}

type JsonReferenceNode = {
  path?: string[] | null
  type?: string | null
}

export function cJsonRuntimeCallName(callee: AnyNode | null | undefined): string | null {
  if (callee === null || typeof callee === 'undefined') {
    return null
  }

  const member = callee as JsonMemberExpressionNode

  if (member.type !== 'MemberExpression') {
    return null
  }

  const object = member.object

  if (object === null || typeof object === 'undefined' || object.type !== 'Reference') {
    return null
  }

  const root = singleStringPathName(object.path)
  const property = member.property

  if (root === null || typeof root === 'undefined' || property === null || typeof property === 'undefined') {
    return null
  }

  return jsonRuntimeMethodNameFromPath([root, property])
}

export type JsonDeclarationDependencies = {
  emitCFieldFlags: (field: CObjectShapeField) => string
  emitCValueExpression: (expression: AnyNode, context: CFunctionContext) => PreparedExpression
  emitPreparedClassInstanceOperand: (
    expression: AnyNode,
    context: CFunctionContext
  ) => JsonClassInstanceOperand | null
  emitPreparedClassToJsonExpression: (expression: AnyNode, context: CFunctionContext) => PreparedExpression | null
  emitPreparedStringBytesOperand: (
    expression: AnyNode,
    context: CFunctionContext,
    tempPrefix: string
  ) => PreparedStringBytesOperand
  inferExpressionType: (expression: AnyNode, context: CFunctionContext) => string
  registerObjectShape: (context: CFunctionContext, name: string, shape: CObjectShape | null | undefined) => void
  registerRuntimeValueMetadata: (
    name: string,
    valueType: string,
    declaration: AnyNode,
    expression: AnyNode | null | undefined,
    context: CFunctionContext
  ) => void
}

export type JsonClassInstanceOperand = {
  descriptor: string
  instance: string
  lines: string[]
}

function jsonParseVariableDeclarationShape(statement: AnyNode): CObjectShape | null {
  if (statement.shape !== null && typeof statement.shape !== 'undefined') {
    return statement.shape
  }

  const init = statement.init

  if (
    init !== null &&
    typeof init !== 'undefined' &&
    init.shape !== null &&
    typeof init.shape !== 'undefined'
  ) {
    return init.shape
  }

  return null
}

function pushJsonLines(target: string[], lines: string[]): void {
  for (const line of lines) {
    target.push(line)
  }
}

function emitJsonStringArgument(operand: PreparedStringBytesOperand): string {
  if (operand.literalValue !== null && typeof operand.literalValue !== 'undefined') {
    return cStringLiteral(operand.literalValue)
  }

  return `inox::StringView(${operand.bytes}, ${operand.length})`
}

function singleStringPathName(path: string[] | null | undefined): string | null {
  if (path === null || typeof path === 'undefined' || path.length !== 1) {
    return null
  }

  return stringValueAt(path, 0)
}

function stringValueAt(values: string[], index: number): string {
  return values[index]
}

function currentJsonErrorTarget(context: CFunctionContext): string | null {
  const targets = context.errorTargets

  if (targets.length === 0) {
    return null
  }

  return targets[targets.length - 1]
}

function currentJsonErrorTargetRequiresActive(context: CFunctionContext): boolean {
  const flags = context.errorTargetActiveFlags

  if (flags.length === 0) {
    return false
  }

  return flags[flags.length - 1] === true
}

function registerJsonErrorValue(context: CFunctionContext): void {
  registerOwnedValue(context, 'inox_error')
}

function registerJsonErrorChannel(context: CFunctionContext): void {
  context.errorChannelUsed = true
  registerJsonErrorValue(context)
}

function pushJsonThrownCheckLines(target: string[], context: CFunctionContext): void {
  const errorTarget = currentJsonErrorTarget(context)

  if ((errorTarget === null || typeof errorTarget === 'undefined') && context.throwingFunction !== true) {
    target.push(`if (inox::thrown()) ${emitFailureStatement(context)}`)
    return
  }

  const errorActiveNeeded =
    currentJsonErrorTargetRequiresActive(context) ||
    ((errorTarget === null || typeof errorTarget === 'undefined') && context.throwingFunction === true)

  if (errorActiveNeeded) {
    registerJsonErrorChannel(context)
  } else if (errorTarget === null || typeof errorTarget === 'undefined') {
    registerJsonErrorValue(context)
  }

  if (!errorActiveNeeded && errorTarget !== null && typeof errorTarget !== 'undefined') {
    target.push(`if (inox::thrown()) goto ${errorTarget};`)
    return
  }

  target.push('if (inox::thrown()) {')
  if (errorTarget === null || typeof errorTarget === 'undefined') {
    target.push('  inox_error = inox::take_exception();')
  }
  if (errorActiveNeeded) {
    target.push('  inox_error_active = 1;')
  }

  if (errorTarget === null || typeof errorTarget === 'undefined') {
    target.push('  inox_status_result = INOX_ERR_THROW;')
    target.push('  goto cleanup;')
  } else {
    target.push(`  goto ${errorTarget};`)
  }
  target.push('}')
}

function jsonParseExpectedTag(valueType: string, shape: CObjectShape | null): string | null {
  if (valueType === 'object') {
    return null
  }

  return cRuntimeValueTag(valueType)
}

export function emitJsonParseVariableDeclaration(
  statement: AnyNode,
  context: CFunctionContext,
  dependencies: JsonDeclarationDependencies
): string[] | null {
  if (
    statement.init === null ||
    typeof statement.init === 'undefined' ||
    statement.init.type !== 'CallExpression' ||
    cJsonRuntimeCallName(statement.init.callee) !== 'parse'
  ) {
    return null
  }

  const shape = jsonParseVariableDeclarationShape(statement)
  const valueType = dependencies.inferExpressionType(statement.init, context)
  const expectedTag = jsonParseExpectedTag(valueType, shape)

  if (valueType !== 'object' && valueType !== 'array' && valueType !== 'unknown') {
    return null
  }

  const target = emitCIdentifier(statement.name)
  const text = dependencies.emitPreparedStringBytesOperand(statement.init.args[0], context, 'inox_json_text')
  const lines: string[] = []

  dependencies.registerRuntimeValueMetadata(statement.name, valueType, statement, statement.init, context)

  if (valueType === 'object') {
    dependencies.registerObjectShape(context, statement.name, shape)
  }

  pushJsonLines(lines, text.lines)
  lines.push(`auto ${target} = JSON.parse(${emitJsonStringArgument(text)});`)
  pushJsonThrownCheckLines(lines, context)
  pushJsonLines(lines, emitRuntimeValueCheckLines(target, expectedTag, context))
  lines.push('')

  return lines
}

export function emitPreparedJsonCallExpression(
  expression: AnyNode,
  context: CFunctionContext,
  dependencies: JsonDeclarationDependencies,
  options: PreparedCallOptions | null
): PreparedExpression | null {
  const method = cJsonRuntimeCallName(expression.callee)

  if (method === null || typeof method === 'undefined') {
    return null
  }

  const outPrefix = method === 'parse' ? 'inox_json_value' : 'inox_json_string'
  let out = nextCName(context, outPrefix)

  if (
    options !== null &&
    typeof options !== 'undefined' &&
    options.out !== null &&
    typeof options.out !== 'undefined'
  ) {
    out = options.out
  }

  if (method === 'parse') {
    const text = dependencies.emitPreparedStringBytesOperand(expression.args[0], context, 'inox_json_text')
    const valueType = dependencies.inferExpressionType(expression, context)
    const expectedTag = jsonParseExpectedTag(valueType, expression.shape ?? null)

    const lines: string[] = []

    pushJsonLines(lines, text.lines)
    lines.push(`auto ${out} = JSON.parse(${emitJsonStringArgument(text)});`)
    pushJsonThrownCheckLines(lines, context)

    pushJsonLines(lines, emitRuntimeValueCheckLines(out, expectedTag, context))

    return {
      lines: lines,
      expression: out,
      owned: false,
      runtimeTypeChecked: expectedTag !== null && typeof expectedTag !== 'undefined',
      valueType
    }
  }

  const lines: string[] = []
  const classToJson = dependencies.emitPreparedClassToJsonExpression(expression.args[0], context)
  const declare = options === null || typeof options === 'undefined' || options.out === null || typeof options.out === 'undefined'

  if (classToJson !== null && typeof classToJson !== 'undefined') {
    pushJsonLines(lines, classToJson.lines)
    lines.push(`${declare ? 'auto ' : ''}${out} = JSON.stringify(${classToJson.expression});`)
    pushJsonThrownCheckLines(lines, context)

    const result: PreparedExpression = {
      lines: lines,
      expression: out,
      owned: false,
      runtimeTypeChecked: true,
      valueType: 'string',
      cppType: 'inox::String'
    }

    if (declare) {
      result.cppDeclaredName = out
    }

    return result
  }

  const classInstance = dependencies.emitPreparedClassInstanceOperand(expression.args[0], context)

  if (classInstance !== null && typeof classInstance !== 'undefined') {
    pushJsonLines(lines, classInstance.lines)
    lines.push(
      `${declare ? 'auto ' : ''}${out} = JSON.stringify(${classInstance.descriptor}, ${classInstance.instance});`
    )
    pushJsonThrownCheckLines(lines, context)

    const result: PreparedExpression = {
      lines: lines,
      expression: out,
      owned: false,
      runtimeTypeChecked: true,
      valueType: 'string',
      cppType: 'inox::String'
    }

    if (declare) {
      result.cppDeclaredName = out
    }

    return result
  }

  const value = dependencies.emitCValueExpression(expression.args[0], context)
  pushJsonLines(lines, value.lines)
  lines.push(`${declare ? 'auto ' : ''}${out} = JSON.stringify(${value.expression});`)
  pushJsonThrownCheckLines(lines, context)

  const result: PreparedExpression = {
    lines: lines,
    expression: out,
    owned: false,
    runtimeTypeChecked: true,
    valueType: 'string',
    cppType: 'inox::String'
  }

  if (declare) {
    result.cppDeclaredName = out
  }

  return result
}

export function emitPreparedJsonScalarParseExpression(
  expression: AnyNode,
  context: CFunctionContext,
  dependencies: JsonDeclarationDependencies
): PreparedExpression | null {
  if (expression.type !== 'CallExpression' || cJsonRuntimeCallName(expression.callee) !== 'parse') {
    return null
  }

  const valueType = dependencies.inferExpressionType(expression, context)

  if (valueType !== 'number' && valueType !== 'boolean') {
    return null
  }

  const value = emitPreparedJsonCallExpression(expression, context, dependencies, null)

  if (value !== null && typeof value !== 'undefined') {
    let resultExpression = `${value.expression}.as.number`

    if (valueType === 'boolean') {
      resultExpression = `(${value.expression}.as.boolean ? 1 : 0)`
    }

    return {
      lines: value.lines,
      expression: resultExpression
    }
  }

  return null
}
