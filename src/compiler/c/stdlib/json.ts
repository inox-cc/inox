import { jsonRuntimeMethodNameFromPath } from '../../stdlib/descriptors/json.ts'
import {
  emitPrepareOwnedValueWrite,
  emitStatusCheck,
  nextCName,
  registerOwnedValue,
  type CFunctionContext
} from '../context.ts'
import { cStringLiteral, emitCIdentifier, utf8ByteLength } from '../identifiers.ts'
import { emitRuntimeNullableValueCheck, emitRuntimeValueCheck } from '../runtime-values.ts'
import { cRuntimeValueTag } from '../value-types.ts'
import type { AnyNode } from '../../types.ts'
import type {
  CObjectShape,
  CObjectShapeField,
  CPreparedCallOptions as PreparedCallOptions,
  CPreparedExpression as PreparedExpression,
  CPreparedStringBytesOperand as PreparedStringBytesOperand
} from '../types.ts'

export function cJsonRuntimeCallName(callee: AnyNode): string | null {
  if (callee?.type !== 'MemberExpression' || callee.object.type !== 'Reference' || callee.object.path.length !== 1) {
    return null
  }

  return jsonRuntimeMethodNameFromPath([callee.object.path[0], callee.property])
}

export type JsonDeclarationDependencies = {
  emitCFieldFlags: (field: CObjectShapeField) => string
  emitCValueExpression: (expression: AnyNode, context: CFunctionContext) => PreparedExpression
  emitPreparedStringBytesOperand: (
    expression: AnyNode,
    context: CFunctionContext,
    tempPrefix?: string
  ) => PreparedStringBytesOperand
  inferExpressionType: (expression: AnyNode, context: CFunctionContext) => string
  registerObjectShape: (context: CFunctionContext, name: string, shape: CObjectShape | null | undefined) => void
}

export function emitJsonParseVariableDeclaration(
  statement: AnyNode,
  context: CFunctionContext,
  dependencies: JsonDeclarationDependencies
): string[] | null {
  if (statement.init?.type !== 'CallExpression' || cJsonRuntimeCallName(statement.init.callee) !== 'parse') {
    return null
  }

  if (statement.valueType !== 'object' || statement.shape?.fields == null) {
    return null
  }

  const fields = statement.shape.fields as CObjectShapeField[]
  const shapeName = nextCName(context, `ccjs_shape_${statement.name}`)
  const fieldsName = `${shapeName}_fields`
  const parsed = nextCName(context, 'ccjs_json_object')
  const parseCall = emitPreparedJsonCallExpression(statement.init, context, dependencies, {
    out: parsed
  })
  const lines = [`static const ccjs_field_info ${fieldsName}[] = {`]

  if (parseCall == null) {
    return null
  }

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

  lines.push(...parseCall.lines)
  lines.push(...emitPrepareOwnedValueWrite(statement.name))
  lines.push(emitStatusCheck(`ccjs_object_new(&ccjs_default_allocator, &${shapeName}, &${statement.name})`, context))

  for (const [index, field] of fields.entries()) {
    const value = nextCName(context, `ccjs_json_${emitCIdentifier(field.name)}`)
    const tag = cRuntimeValueTag(field.valueType)

    registerOwnedValue(context, value)
    lines.push(...emitPrepareOwnedValueWrite(value))
    lines.push(
      emitStatusCheck(
        `ccjs_object_get(${parsed}, ${cStringLiteral(field.name)}, ${utf8ByteLength(field.name)}, &${value})`,
        context
      )
    )
    lines.push(
      ...(field.nullable === true
        ? emitRuntimeNullableValueCheck(value, tag, context)
        : [emitRuntimeValueCheck(value, tag, context)].filter(Boolean))
    )
    lines.push(emitStatusCheck(`ccjs_object_init_known(${statement.name}, ${index}, ${value})`, context))
  }

  return lines
}

export function emitPreparedJsonCallExpression(
  expression: AnyNode,
  context: CFunctionContext,
  dependencies: JsonDeclarationDependencies,
  options: PreparedCallOptions = {}
): PreparedExpression | null {
  const method = cJsonRuntimeCallName(expression?.callee)

  if (method == null) {
    return null
  }

  const out = options.out ?? nextCName(context, 'ccjs_json_value')

  if (options.owned !== false) {
    registerOwnedValue(context, out)
  }

  if (method === 'parse') {
    const text = dependencies.emitPreparedStringBytesOperand(expression.args[0], context, 'ccjs_json_text')
    const expectedTag = cRuntimeValueTag(dependencies.inferExpressionType(expression, context))

    return {
      lines: [
        ...text.lines,
        ...emitPrepareOwnedValueWrite(out),
        emitStatusCheck(`ccjs_json_parse(&ccjs_default_allocator, ${text.bytes}, ${text.length}, &${out})`, context),
        ...(expectedTag == null ? [] : [emitRuntimeValueCheck(out, expectedTag, context)])
      ],
      expression: out
    }
  }

  const value = dependencies.emitCValueExpression(expression.args[0], context)

  return {
    lines: [
      ...value.lines,
      ...emitPrepareOwnedValueWrite(out),
      emitStatusCheck(`ccjs_json_stringify(&ccjs_default_allocator, ${value.expression}, &${out})`, context),
      emitRuntimeValueCheck(out, 'CCJS_TAG_STRING', context)
    ],
    expression: out
  }
}

export function emitPreparedJsonScalarParseExpression(
  expression: AnyNode,
  context: CFunctionContext,
  dependencies: JsonDeclarationDependencies
): PreparedExpression | null {
  if (expression?.type !== 'CallExpression' || cJsonRuntimeCallName(expression.callee) !== 'parse') {
    return null
  }

  const valueType = dependencies.inferExpressionType(expression, context)

  if (valueType !== 'number' && valueType !== 'boolean') {
    return null
  }

  const value = emitPreparedJsonCallExpression(expression, context, dependencies)

  if (value == null) {
    return null
  }

  return {
    lines: value.lines,
    expression: valueType === 'boolean' ? `(${value.expression}.as.boolean ? 1 : 0)` : `${value.expression}.as.number`
  }
}
