import { jsonRuntimeMethodNameFromPath } from '../../stdlib/descriptors/json.ts'
import {
  emitPrepareOwnedValueWrite,
  emitFailureStatement,
  emitStatusCheck,
  nextCName,
  registerOwnedValue
} from '../context.ts'
import { cStringLiteral, emitCIdentifier, utf8ByteLength } from '../identifiers.ts'
import { emitRuntimeNullableValueCheck, emitRuntimeValueCheck, emitRuntimeValueCheckLines } from '../runtime-values.ts'
import { cRuntimeValueTag } from '../value-types.ts'
import type { CFunctionContext } from '../context.ts'
import type { AnyNode } from '../../types.ts'
import type {
  CObjectShape,
  CObjectShapeField,
  CPreparedCallOptions as PreparedCallOptions,
  CPreparedExpression as PreparedExpression,
  CPreparedStringBytesOperand as PreparedStringBytesOperand
} from '../types.ts'

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
  if (callee == null) {
    return null
  }

  const member = callee as JsonMemberExpressionNode

  if (member.type !== 'MemberExpression') {
    return null
  }

  const object = member.object

  if (object == null || object.type !== 'Reference') {
    return null
  }

  const root = singleStringPathName(object.path)
  const property = member.property

  if (root == null || property == null) {
    return null
  }

  return jsonRuntimeMethodNameFromPath([root, property])
}

export type JsonDeclarationDependencies = {
  emitCFieldFlags: (field: CObjectShapeField) => string
  emitCValueExpression: (expression: AnyNode, context: CFunctionContext) => PreparedExpression
  emitPreparedStringBytesOperand: (expression: AnyNode, context: CFunctionContext, tempPrefix: string) => PreparedStringBytesOperand
  inferExpressionType: (expression: AnyNode, context: CFunctionContext) => string
  registerObjectShape: (context: CFunctionContext, name: string, shape: CObjectShape | null | undefined) => void
}

function pushJsonLines(target: string[], lines: string[]): void {
  for (const line of lines) {
    target.push(line)
  }
}

function singleStringPathName(path: string[] | null | undefined): string | null {
  if (path == null || path.length !== 1) {
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

function shouldUseDetailedJsonParseError(context: CFunctionContext): boolean {
  return currentJsonErrorTarget(context) != null || context.throwingFunction === true
}

function pushJsonParseStatusLines(
  target: string[],
  call: string,
  context: CFunctionContext,
  detailedError: string | null
): void {
  const errorTarget = currentJsonErrorTarget(context)

  if (errorTarget == null && context.throwingFunction !== true) {
    target.push(emitStatusCheck(call, context))
    return
  }

  const status = nextCName(context, 'ccjs_json_status')
  const message = 'JSON.parse failed'
  const messageLiteral = cStringLiteral(message)
  const messageLength = utf8ByteLength(message)
  const failureStatement = emitFailureStatement(context)
  const fallbackErrorLine = `if (ccjs_string_from_literal(&ccjs_default_allocator, ${messageLiteral}, ${messageLength}, &ccjs_error) != CCJS_OK) ${failureStatement}`
  let gotoTarget = 'ccjs_cleanup'

  if (errorTarget != null) {
    gotoTarget = errorTarget
  }

  target.push(`ccjs_status ${status} = ${call};`)
  target.push(`if (${status} != CCJS_OK) {`)
  target.push('  ccjs_release(ccjs_error);')
  target.push('  ccjs_error = ccjs_undefined_value();')

  if (detailedError != null) {
    target.push(`  if (${detailedError}.tag == CCJS_TAG_STRING && ${detailedError}.as.ref != 0) {`)
    target.push(`    ccjs_error = ${detailedError};`)
    target.push(`    ${detailedError} = ccjs_undefined_value();`)
    target.push('  } else {')
    target.push(`    ${fallbackErrorLine}`)
    target.push(`    ccjs_release(${detailedError});`)
    target.push(`    ${detailedError} = ccjs_undefined_value();`)
    target.push('  }')
  } else {
    target.push(`  ${fallbackErrorLine}`)
  }

  if (errorTarget == null) {
    target.push('  ccjs_status_result = CCJS_ERR_THROW;')
  }

  target.push('  ccjs_error_active = 1;')
  target.push(`  goto ${gotoTarget};`)
  target.push('}')
}

export function emitJsonParseVariableDeclaration(
  statement: AnyNode,
  context: CFunctionContext,
  dependencies: JsonDeclarationDependencies
): string[] | null {
  if (
    statement.init == null ||
    statement.init.type !== 'CallExpression' ||
    cJsonRuntimeCallName(statement.init.callee) !== 'parse'
  ) {
    return null
  }

  if (statement.valueType !== 'object' || statement.shape == null || statement.shape.fields == null) {
    return null
  }

  const fields: CObjectShapeField[] = statement.shape.fields
  const shapeName = nextCName(context, `ccjs_shape_${statement.name}`)
  const fieldsName = `${shapeName}_fields`
  const parsed = nextCName(context, 'ccjs_json_object')
  const parseCall = emitPreparedJsonCallExpression(statement.init, context, dependencies, {
    out: parsed
  })
  const lines = [`static const ccjs_field_info ${fieldsName}[] = {`]

  for (const field of fields) {
    lines.push(`  { ${cStringLiteral(field.name)}, ${dependencies.emitCFieldFlags(field)} },`)
  }

  lines.push('};')
  lines.push(`static const ccjs_shape ${shapeName} = {`)
  lines.push(`  ${fields.length},`)
  lines.push(`  ${fieldsName}`)
  lines.push('};')

  registerOwnedValue(context, statement.name)
  context.variables.set(statement.name, 'object')
  dependencies.registerObjectShape(context, statement.name, statement.shape)

  if (parseCall != null) {
    pushJsonLines(lines, parseCall.lines)
  } else {
    return null
  }
  pushJsonLines(lines, emitPrepareOwnedValueWrite(statement.name))
  lines.push(emitStatusCheck(`ccjs_object_new(&ccjs_default_allocator, &${shapeName}, &${statement.name})`, context))

  for (let index = 0; index < fields.length; index++) {
    const field = fields[index]
    const value = nextCName(context, `ccjs_json_${emitCIdentifier(field.name)}`)
    const tag = cRuntimeValueTag(field.valueType)

    registerOwnedValue(context, value)
    pushJsonLines(lines, emitPrepareOwnedValueWrite(value))
    lines.push(
      emitStatusCheck(
        `ccjs_object_get(${parsed}, ${cStringLiteral(field.name)}, ${utf8ByteLength(field.name)}, &${value})`,
        context
      )
    )
    if (field.nullable === true) {
      pushJsonLines(lines, emitRuntimeNullableValueCheck(value, tag, context))
    } else {
      pushJsonLines(lines, emitRuntimeValueCheckLines(value, tag, context))
    }
    lines.push(emitStatusCheck(`ccjs_object_init_known(${statement.name}, ${index}, ${value})`, context))
  }

  return lines
}

export function emitPreparedJsonCallExpression(
  expression: AnyNode,
  context: CFunctionContext,
  dependencies: JsonDeclarationDependencies,
  options: PreparedCallOptions | null
): PreparedExpression | null {
  const method = cJsonRuntimeCallName(expression.callee)

  if (method == null) {
    return null
  }

  let out = nextCName(context, 'ccjs_json_value')

  if (options != null && options.out != null) {
    out = options.out
  }

  if (options == null || options.owned !== false) {
    registerOwnedValue(context, out)
  }

  if (method === 'parse') {
    const text = dependencies.emitPreparedStringBytesOperand(expression.args[0], context, 'ccjs_json_text')
    const expectedTag = cRuntimeValueTag(dependencies.inferExpressionType(expression, context))
    let detailedError: string | null = null

    const lines: string[] = []

    pushJsonLines(lines, text.lines)
    pushJsonLines(lines, emitPrepareOwnedValueWrite(out))

    if (shouldUseDetailedJsonParseError(context)) {
      detailedError = nextCName(context, 'ccjs_json_error')
      registerOwnedValue(context, detailedError)
      pushJsonLines(lines, emitPrepareOwnedValueWrite(detailedError))
    }

    let parseCall = `ccjs_json_parse(&ccjs_default_allocator, ${text.bytes}, ${text.length}, &${out})`

    if (detailedError != null) {
      parseCall = `ccjs_json_parse_with_error(&ccjs_default_allocator, ${text.bytes}, ${text.length}, &${out}, &${detailedError})`
    }

    pushJsonParseStatusLines(lines, parseCall, context, detailedError)

    pushJsonLines(lines, emitRuntimeValueCheckLines(out, expectedTag, context))

    return {
      lines: lines,
      expression: out
    }
  }

  const value = dependencies.emitCValueExpression(expression.args[0], context)
  const lines: string[] = []

  pushJsonLines(lines, value.lines)
  pushJsonLines(lines, emitPrepareOwnedValueWrite(out))
  lines.push(emitStatusCheck(`ccjs_json_stringify(&ccjs_default_allocator, ${value.expression}, &${out})`, context))
  lines.push(emitRuntimeValueCheck(out, 'CCJS_TAG_STRING', context))

  return {
    lines: lines,
    expression: out
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

  if (value != null) {
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
