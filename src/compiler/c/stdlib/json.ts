import { jsonRuntimeMethodNameFromPath } from '../../stdlib/descriptors/json.ts'
import {
  emitPrepareOwnedValueWrite,
  emitStatusCheck,
  nextCName,
  registerOwnedValue
} from '../context.ts'
import { cStringLiteral, emitCIdentifier, utf8ByteLength } from '../identifiers.ts'
import { emitRuntimeNullableValueCheck, emitRuntimeValueCheck } from '../runtime-values.ts'
import { cRuntimeValueTag } from '../value-types.ts'

export function cJsonRuntimeCallName(callee: any): string | null {
  if (callee?.type !== 'MemberExpression' || callee.object.type !== 'Reference' || callee.object.path.length !== 1) {
    return null
  }

  return jsonRuntimeMethodNameFromPath([callee.object.path[0], callee.property])
}

type PreparedExpression = {
  lines: string[]
  expression: string
}

export type JsonDeclarationDependencies = {
  emitCFieldFlags: (field: any) => string
  emitPreparedJsonCallExpression: (expression: any, context: any, options?: any) => PreparedExpression | null
  registerObjectShape: (context: any, name: string, shape: any) => void
}

export function emitJsonParseVariableDeclaration(statement, context, dependencies: JsonDeclarationDependencies) {
  if (statement.init?.type !== 'CallExpression' || cJsonRuntimeCallName(statement.init.callee) !== 'parse') {
    return null
  }

  if (statement.valueType !== 'object' || statement.shape?.fields == null) {
    return null
  }

  const fields = statement.shape.fields
  const shapeName = nextCName(context, `ccjs_shape_${statement.name}`)
  const fieldsName = `${shapeName}_fields`
  const parsed = nextCName(context, 'ccjs_json_object')
  const parseCall = dependencies.emitPreparedJsonCallExpression(statement.init, context, {
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
