import type { AnyNode } from '../../../../compiler/types.ts'
import type { CFunctionContext } from '../../../../compiler/c/context.ts'
import {
  emitFailureStatement,
  emitPrepareOwnedValueWrite,
  emitStatusCheck,
  nextCName,
  registerOwnedValue
} from '../../../../compiler/c/context.ts'
import { cStringLiteral, emitCIdentifier, utf8ByteLength } from '../../../../compiler/c/identifiers.ts'
import { emitRuntimeValueCheck, emitRuntimeValueCheckLines } from '../../../../compiler/c/runtime-values.ts'
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

function pushIndentedJsonLines(target: string[], lines: string[], indent: string): void {
  for (const line of lines) {
    target.push(`${indent}${line}`)
  }
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

function shouldUseDetailedJsonParseError(context: CFunctionContext): boolean {
  return !!currentJsonErrorTarget(context) || context.throwingFunction === true
}

function registerJsonErrorValue(context: CFunctionContext): void {
  registerOwnedValue(context, 'inox_error')
}

function registerJsonErrorChannel(context: CFunctionContext): void {
  context.errorChannelUsed = true
  registerJsonErrorValue(context)
}

function pushJsonParseStatusLines(
  target: string[],
  call: string,
  context: CFunctionContext,
  detailedError: string | null
): void {
  const errorTarget = currentJsonErrorTarget(context)

  if ((errorTarget === null || typeof errorTarget === 'undefined') && context.throwingFunction !== true) {
    target.push(emitStatusCheck(call, context))
    return
  }

  const status = nextCName(context, 'inox_json_status')
  const message = 'JSON.parse failed'
  const messageLiteral = cStringLiteral(message)
  const messageLength = utf8ByteLength(message)
  const errorActiveNeeded =
    currentJsonErrorTargetRequiresActive(context) ||
    ((errorTarget === null || typeof errorTarget === 'undefined') && context.throwingFunction === true)
  const failureStatement = emitFailureStatement(context)
  const fallbackErrorLine = `if (inox_string_from_literal(&inox_default_allocator, ${messageLiteral}, ${messageLength}, &inox_error) != INOX_OK) ${failureStatement}`
  let gotoTarget = 'inox_cleanup'

  if (errorActiveNeeded) {
    registerJsonErrorChannel(context)
  } else {
    registerJsonErrorValue(context)
  }

  if (errorTarget !== null && typeof errorTarget !== 'undefined') {
    gotoTarget = errorTarget
  }

  target.push(`inox_status ${status} = ${call};`)
  target.push(`if (${status} != INOX_OK) {`)
  pushIndentedJsonLines(target, emitPrepareOwnedValueWrite('inox_error'), '  ')

  if (detailedError !== null && typeof detailedError !== 'undefined') {
    target.push(`  if (${detailedError}.tag == INOX_TAG_STRING && ${detailedError}.as.ref != 0) {`)
    target.push(`    inox_error = ${detailedError};`)
    target.push(`    ${detailedError} = inox_undefined_value();`)
    target.push('  } else {')
    target.push(`    ${fallbackErrorLine}`)
    pushIndentedJsonLines(target, emitPrepareOwnedValueWrite(detailedError), '    ')
    target.push('  }')
  } else {
    target.push(`  ${fallbackErrorLine}`)
  }

  if (errorTarget === null || typeof errorTarget === 'undefined') {
    target.push('  inox_status_result = INOX_ERR_THROW;')
  }

  if (errorActiveNeeded) {
    target.push('  inox_error_active = 1;')
  }
  target.push(`  goto ${gotoTarget};`)
  target.push('}')
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

  if (
    statement.valueType !== 'object' ||
    shape === null ||
    shape.fields === null ||
    typeof shape.fields === 'undefined'
  ) {
    return null
  }

  const target = emitCIdentifier(statement.name)
  context.variables.set(statement.name, 'object')
  dependencies.registerObjectShape(context, statement.name, shape)

  const parseCall = emitPreparedJsonCallExpression(statement.init, context, dependencies, {
    out: target,
    owned: false,
    prepareOut: false
  })

  if (parseCall === null || typeof parseCall === 'undefined') {
    return null
  }

  const lines: string[] = [`inox::Value ${target};`]
  pushJsonLines(lines, parseCall.lines)

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

  let out = nextCName(context, 'inox_json_value')

  if (
    options !== null &&
    typeof options !== 'undefined' &&
    options.out !== null &&
    typeof options.out !== 'undefined'
  ) {
    out = options.out
  }

  const ownsOut = options === null || typeof options === 'undefined' || options.owned !== false
  const preparesOut = options === null || typeof options === 'undefined' || options.prepareOut !== false

  if (ownsOut) {
    registerOwnedValue(context, out)
  }

  if (method === 'parse') {
    const text = dependencies.emitPreparedStringBytesOperand(expression.args[0], context, 'inox_json_text')
    const valueType = dependencies.inferExpressionType(expression, context)
    const expectedTag = cRuntimeValueTag(valueType)
    let detailedError: string | null = null

    const lines: string[] = []

    pushJsonLines(lines, text.lines)
    if (preparesOut) {
      pushJsonLines(lines, emitPrepareOwnedValueWrite(out))
    }

    if (shouldUseDetailedJsonParseError(context)) {
      detailedError = nextCName(context, 'inox_json_error')
      registerOwnedValue(context, detailedError)
      pushJsonLines(lines, emitPrepareOwnedValueWrite(detailedError))
    }

    let parseCall = `inox_json_parse(&inox_default_allocator, ${text.bytes}, ${text.length}, &${out})`

    if (detailedError !== null && typeof detailedError !== 'undefined') {
      parseCall = `inox_json_parse_with_error(&inox_default_allocator, ${text.bytes}, ${text.length}, &${out}, &${detailedError})`
    }

    pushJsonParseStatusLines(lines, parseCall, context, detailedError)

    pushJsonLines(lines, emitRuntimeValueCheckLines(out, expectedTag, context))

    return {
      lines: lines,
      expression: out,
      owned: ownsOut,
      runtimeTypeChecked: expectedTag !== null && typeof expectedTag !== 'undefined',
      valueType
    }
  }

  const lines: string[] = []
  const classToJson = dependencies.emitPreparedClassToJsonExpression(expression.args[0], context)

  if (classToJson !== null && typeof classToJson !== 'undefined') {
    pushJsonLines(lines, classToJson.lines)
    pushJsonLines(lines, emitPrepareOwnedValueWrite(out))
    lines.push(emitStatusCheck(`inox_json_stringify(&inox_default_allocator, ${classToJson.expression}, &${out})`, context))
    lines.push(emitRuntimeValueCheck(out, 'INOX_TAG_STRING', context))

    return {
      lines: lines,
      expression: out,
      owned: ownsOut,
      runtimeTypeChecked: true,
      valueType: 'string'
    }
  }

  const classInstance = dependencies.emitPreparedClassInstanceOperand(expression.args[0], context)

  if (classInstance !== null && typeof classInstance !== 'undefined') {
    pushJsonLines(lines, classInstance.lines)
    pushJsonLines(lines, emitPrepareOwnedValueWrite(out))
    lines.push(
      emitStatusCheck(
        `inox_json_stringify_class_instance(&inox_default_allocator, &${classInstance.descriptor}, ${classInstance.instance}, &${out})`,
        context
      )
    )
    lines.push(emitRuntimeValueCheck(out, 'INOX_TAG_STRING', context))

    return {
      lines: lines,
      expression: out,
      owned: ownsOut,
      runtimeTypeChecked: true,
      valueType: 'string'
    }
  }

  const value = dependencies.emitCValueExpression(expression.args[0], context)
  pushJsonLines(lines, value.lines)
  pushJsonLines(lines, emitPrepareOwnedValueWrite(out))
  lines.push(emitStatusCheck(`inox_json_stringify(&inox_default_allocator, ${value.expression}, &${out})`, context))
  lines.push(emitRuntimeValueCheck(out, 'INOX_TAG_STRING', context))

  return {
    lines: lines,
    expression: out,
    owned: ownsOut,
    runtimeTypeChecked: true,
    valueType: 'string'
  }
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
