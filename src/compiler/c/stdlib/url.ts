import { urlMutableObjectFields, urlObjectFields, urlSearchParamsObjectFields } from '../../stdlib/descriptors/url.ts'
import type { AnyNode } from '../../types.ts'
import {
  emitPrepareOwnedValueWrite,
  emitRuntimeTypeCheck,
  emitStatusCheck,
  nextCName,
  registerOwnedValue,
  type CFunctionContext
} from '../context.ts'
import { cStringLiteral } from '../identifiers.ts'
import type {
  CObjectShape,
  CPreparedCallOptions as PreparedCallOptions,
  CPreparedExpression as PreparedExpression,
  CPreparedStringBytesOperand as PreparedStringBytesOperand
} from '../types.ts'

export type UrlLoweringDependencies = {
  emitCValueExpression: (expression: AnyNode, context: CFunctionContext) => PreparedExpression
  emitPreparedStringBytesOperand: (
    expression: AnyNode,
    context: CFunctionContext,
    tempPrefix?: string
  ) => PreparedStringBytesOperand
  registerObjectShape: (context: CFunctionContext, name: string, shape: CObjectShape | null | undefined) => void
}

export function cUrlRuntimeMethodName(expression: AnyNode): string | null {
  if (
    (expression?.type !== 'CallExpression' && expression?.type !== 'NewExpression') ||
    typeof expression.urlRuntimeMethod !== 'string'
  ) {
    return null
  }

  return expression.urlRuntimeMethod
}

export function emitPreparedUrlStringCallExpression(
  expression: AnyNode,
  context: CFunctionContext,
  dependencies: UrlLoweringDependencies,
  options: PreparedCallOptions = {}
): PreparedExpression | null {
  if (cUrlRuntimeMethodName(expression) !== 'fileURLToPath') {
    return null
  }

  const arg = dependencies.emitCValueExpression(expression.args[0], context)
  const out = options.out ?? nextCName(context, 'ccjs_url_path')

  if (options.owned !== false) {
    registerOwnedValue(context, out)
  }

  return {
    lines: [
      ...arg.lines,
      ...emitPrepareOwnedValueWrite(out),
      emitStatusCheck(`ccjs_url_file_url_to_path(&ccjs_default_allocator, ${arg.expression}, &${out})`, context)
    ],
    expression: out
  }
}

export function emitPreparedUrlObjectExpression(
  expression: AnyNode,
  context: CFunctionContext,
  dependencies: UrlLoweringDependencies,
  options: PreparedCallOptions = {}
): PreparedExpression | null {
  const method = cUrlRuntimeMethodName(expression)

  if (method !== 'pathToFileURL' && method !== 'URL') {
    return null
  }

  const out = options.out ?? nextCName(context, 'ccjs_url_object')
  const input = dependencies.emitCValueExpression(expression.args[0], context)
  const shape = emitUrlObjectShape(context)
  const lines = [...input.lines, ...shape.lines, ...emitPrepareOwnedValueWrite(out)]

  if (options.owned !== false) {
    registerOwnedValue(context, out)
  }

  context.variables.set(out, 'object')
  dependencies.registerObjectShape(context, out, expression.shape)

  if (method === 'pathToFileURL') {
    lines.push(
      emitStatusCheck(
        `ccjs_url_path_to_file_url(&ccjs_default_allocator, ${input.expression}, ${shape.expression}, &${out})`,
        context
      )
    )

    return {
      lines,
      expression: out
    }
  }

  const base =
    expression.args[1] == null
      ? { lines: [] as string[], expression: 'ccjs_undefined_value()' }
      : dependencies.emitCValueExpression(expression.args[1], context)

  lines.push(...base.lines)
  lines.push(
    emitStatusCheck(
      `ccjs_url_new(&ccjs_default_allocator, ${input.expression}, ${base.expression}, ${expression.args[1] == null ? '0' : '1'}, ${shape.expression}, &${out})`,
      context
    )
  )

  return {
    lines,
    expression: out
  }
}

export function emitPreparedUrlSearchParamsObjectExpression(
  expression: AnyNode,
  context: CFunctionContext,
  dependencies: UrlLoweringDependencies,
  options: PreparedCallOptions = {}
): PreparedExpression | null {
  if (cUrlRuntimeMethodName(expression) !== 'URLSearchParams') {
    return null
  }

  const out = options.out ?? nextCName(context, 'ccjs_url_search_params')
  const init =
    expression.args[0] == null
      ? { lines: [] as string[], expression: 'ccjs_undefined_value()' }
      : dependencies.emitCValueExpression(expression.args[0], context)
  const shape = emitUrlSearchParamsObjectShape(context)
  const lines = [...init.lines, ...shape.lines, ...emitPrepareOwnedValueWrite(out)]

  if (options.owned !== false) {
    registerOwnedValue(context, out)
  }

  context.variables.set(out, 'object')
  dependencies.registerObjectShape(context, out, expression.shape)
  lines.push(
    emitStatusCheck(
      `ccjs_url_search_params_new(&ccjs_default_allocator, ${init.expression}, ${shape.expression}, &${out})`,
      context
    )
  )

  return {
    lines,
    expression: out
  }
}

export function emitPreparedUrlSearchParamsCallExpression(
  expression: AnyNode,
  context: CFunctionContext,
  dependencies: UrlLoweringDependencies,
  options: PreparedCallOptions = {}
): PreparedExpression | null {
  const method = cUrlRuntimeMethodName(expression)

  if (method == null || !method.startsWith('URLSearchParams.')) {
    return null
  }

  const receiver = dependencies.emitCValueExpression(expression.callee.object, context)
  const name =
    expression.args[0] == null
      ? null
      : dependencies.emitPreparedStringBytesOperand(expression.args[0], context, 'ccjs_url_param_name')
  const lines = [
    ...receiver.lines,
    emitRuntimeTypeCheck(`${receiver.expression}.tag != CCJS_TAG_OBJECT || ${receiver.expression}.as.ref == 0`, context)
  ]

  if (name != null) {
    lines.push(...name.lines)
  }

  if (method === 'URLSearchParams.has') {
    const out = options.out ?? nextCName(context, 'ccjs_url_param_has')
    lines.push(`int ${out} = 0;`)
    lines.push(
      emitStatusCheck(
        `ccjs_url_search_params_has(${receiver.expression}, ${name?.bytes ?? '""'}, ${name?.length ?? '0'}, &${out})`,
        context
      )
    )

    return {
      lines,
      expression: out,
      valueType: 'boolean'
    }
  }

  if (method === 'URLSearchParams.get' || method === 'URLSearchParams.toString') {
    const out = options.out ?? nextCName(context, 'ccjs_url_param_value')

    if (options.owned !== false) {
      registerOwnedValue(context, out)
    }

    lines.push(...emitPrepareOwnedValueWrite(out))
    lines.push(
      method === 'URLSearchParams.get'
        ? emitStatusCheck(
            `ccjs_url_search_params_get(&ccjs_default_allocator, ${receiver.expression}, ${name?.bytes ?? '""'}, ${name?.length ?? '0'}, &${out})`,
            context
          )
        : emitStatusCheck(
            `ccjs_url_search_params_to_string(&ccjs_default_allocator, ${receiver.expression}, &${out})`,
            context
          )
    )

    return {
      lines,
      expression: out,
      valueType: 'string',
      nullable: method === 'URLSearchParams.get'
    }
  }

  if (method === 'URLSearchParams.delete') {
    lines.push(
      emitStatusCheck(
        `ccjs_url_search_params_delete(&ccjs_default_allocator, ${receiver.expression}, ${name?.bytes ?? '""'}, ${name?.length ?? '0'})`,
        context
      )
    )

    return {
      lines,
      expression: '',
      valueType: 'void'
    }
  }

  const value = dependencies.emitPreparedStringBytesOperand(expression.args[1], context, 'ccjs_url_param_value')
  lines.push(...value.lines)
  lines.push(
    emitStatusCheck(
      method === 'URLSearchParams.set'
        ? `ccjs_url_search_params_set(&ccjs_default_allocator, ${receiver.expression}, ${name?.bytes ?? '""'}, ${name?.length ?? '0'}, ${value.bytes}, ${value.length})`
        : `ccjs_url_search_params_append(&ccjs_default_allocator, ${receiver.expression}, ${name?.bytes ?? '""'}, ${name?.length ?? '0'}, ${value.bytes}, ${value.length})`,
      context
    )
  )

  return {
    lines,
    expression: '',
    valueType: 'void'
  }
}

export function emitUrlObjectFieldAssignment(
  expression: AnyNode,
  context: CFunctionContext,
  dependencies: UrlLoweringDependencies
): string[] | null {
  if (expression?.type !== 'AssignmentExpression' || expression.urlRuntimeMethod !== 'URL.setField') {
    return null
  }

  const field = expression.urlRuntimeField
  const fieldIndex = urlObjectFields.indexOf(field)

  if (fieldIndex === -1 || !urlMutableObjectFields.includes(field)) {
    return null
  }

  const object = dependencies.emitCValueExpression(expression.target.object, context)
  const value = dependencies.emitCValueExpression(expression.value, context)

  return [
    ...object.lines,
    ...value.lines,
    emitStatusCheck(
      `ccjs_url_set_field(&ccjs_default_allocator, ${object.expression}, ${fieldIndex}, ${value.expression})`,
      context
    )
  ]
}

function emitUrlObjectShape(context: CFunctionContext): PreparedExpression {
  const shapeName = nextCName(context, 'ccjs_shape_url')
  const fieldsName = `${shapeName}_fields`
  const lines = [`static const ccjs_field_info ${fieldsName}[] = {`]

  for (const field of urlObjectFields) {
    lines.push(`  { ${cStringLiteral(field)}, CCJS_FIELD_READONLY },`)
  }

  lines.push('};')
  lines.push(`static const ccjs_shape ${shapeName} = {`)
  lines.push(`  ${urlObjectFields.length},`)
  lines.push(`  ${fieldsName}`)
  lines.push('};')

  return {
    lines,
    expression: `&${shapeName}`
  }
}

function emitUrlSearchParamsObjectShape(context: CFunctionContext): PreparedExpression {
  const shapeName = nextCName(context, 'ccjs_shape_url_search_params')
  const fieldsName = `${shapeName}_fields`
  const lines = [`static const ccjs_field_info ${fieldsName}[] = {`]

  for (const field of urlSearchParamsObjectFields) {
    lines.push(`  { ${cStringLiteral(field)}, 0 },`)
  }

  lines.push('};')
  lines.push(`static const ccjs_shape ${shapeName} = {`)
  lines.push(`  ${urlSearchParamsObjectFields.length},`)
  lines.push(`  ${fieldsName}`)
  lines.push('};')

  return {
    lines,
    expression: `&${shapeName}`
  }
}
