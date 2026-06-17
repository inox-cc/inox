import { urlMutableObjectFields, urlObjectFields, urlSearchParamsObjectFields } from '../../stdlib/descriptors/url.ts'
import type { AnyNode } from '../../types.ts'
import {
  emitPrepareOwnedValueWrite,
  emitRuntimeTypeCheck,
  emitStatusCheck,
  nextCName,
  registerOwnedValue
} from '../context.ts'
import type { CFunctionContext } from '../context.ts'
import { cStringLiteral } from '../identifiers.ts'
import type {
  CObjectShape,
  CPreparedCallOptions as PreparedCallOptions,
  CPreparedExpression as PreparedExpression,
  CPreparedStringBytesOperand as PreparedStringBytesOperand
} from '../types.ts'

export type UrlLoweringDependencies = {
  emitCValueExpression: (expression: AnyNode, context: CFunctionContext) => PreparedExpression
  emitPreparedStringBytesOperand: (expression: AnyNode, context: CFunctionContext, tempPrefix: string) => PreparedStringBytesOperand
  registerObjectShape: (context: CFunctionContext, name: string, shape: CObjectShape | null | undefined) => void
}

function pushUrlLines(target: string[], lines: string[]): void {
  for (const line of lines) {
    target.push(line)
  }
}

function emptyPreparedUrlExpression(expression: string): PreparedExpression {
  return {
    lines: [],
    expression
  }
}

function urlOutName(options: PreparedCallOptions, context: CFunctionContext, prefix: string): string {
  let out = nextCName(context, prefix)

  if (options.out != null) {
    out = options.out
  }

  return out
}

function urlStringBytes(prepared: PreparedStringBytesOperand | null): string {
  let bytes = '""'

  if (prepared != null) {
    bytes = prepared.bytes
  }

  return bytes
}

function urlStringLength(prepared: PreparedStringBytesOperand | null): string {
  let length = '0'

  if (prepared != null) {
    length = prepared.length
  }

  return length
}

function isUrlSearchParamsRuntimeCall(method: string): boolean {
  if (method === 'URLSearchParams.append') {
    return true
  }

  if (method === 'URLSearchParams.delete') {
    return true
  }

  if (method === 'URLSearchParams.get') {
    return true
  }

  if (method === 'URLSearchParams.has') {
    return true
  }

  if (method === 'URLSearchParams.set') {
    return true
  }

  return method === 'URLSearchParams.toString'
}

function urlObjectFieldIndex(field: string): number {
  for (let index = 0; index < urlObjectFields.length; index = index + 1) {
    if (urlObjectFields[index] === field) {
      return index
    }
  }

  return -1
}

function isMutableUrlObjectField(field: string): boolean {
  for (let index = 0; index < urlMutableObjectFields.length; index = index + 1) {
    if (urlMutableObjectFields[index] === field) {
      return true
    }
  }

  return false
}

export function cUrlRuntimeMethodName(expression: AnyNode | null | undefined): string | null {
  if (expression == null || (expression.type !== 'CallExpression' && expression.type !== 'NewExpression')) {
    return null
  }

  if (expression.urlRuntimeMethod == null) {
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
  const out = urlOutName(options, context, 'ccjs_url_path')
  const lines: string[] = []

  if (options.owned !== false) {
    registerOwnedValue(context, out)
  }

  pushUrlLines(lines, arg.lines)
  pushUrlLines(lines, emitPrepareOwnedValueWrite(out))
  lines.push(emitStatusCheck(`ccjs_url_file_url_to_path(&ccjs_default_allocator, ${arg.expression}, &${out})`, context))

  return {
    lines,
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

  const out = urlOutName(options, context, 'ccjs_url_object')
  const input = dependencies.emitCValueExpression(expression.args[0], context)
  const shape = emitUrlObjectShape(context)
  const lines: string[] = []

  pushUrlLines(lines, input.lines)
  pushUrlLines(lines, shape.lines)
  pushUrlLines(lines, emitPrepareOwnedValueWrite(out))

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

  let base = emptyPreparedUrlExpression('ccjs_undefined_value()')
  let hasBase = '0'

  if (expression.args.length > 1) {
    base = dependencies.emitCValueExpression(expression.args[1], context)
    hasBase = '1'
  }

  pushUrlLines(lines, base.lines)
  lines.push(
    emitStatusCheck(
      `ccjs_url_new(&ccjs_default_allocator, ${input.expression}, ${base.expression}, ${hasBase}, ${shape.expression}, &${out})`,
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

  const out = urlOutName(options, context, 'ccjs_url_search_params')
  let init = emptyPreparedUrlExpression('ccjs_undefined_value()')
  const shape = emitUrlSearchParamsObjectShape(context)
  const lines: string[] = []

  if (expression.args.length > 0) {
    init = dependencies.emitCValueExpression(expression.args[0], context)
  }

  pushUrlLines(lines, init.lines)
  pushUrlLines(lines, shape.lines)
  pushUrlLines(lines, emitPrepareOwnedValueWrite(out))

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

  if (method == null || !isUrlSearchParamsRuntimeCall(method)) {
    return null
  }

  const receiver = dependencies.emitCValueExpression(expression.callee.object, context)
  let name: PreparedStringBytesOperand | null = null
  const lines: string[] = []

  if (expression.args.length > 0) {
    name = dependencies.emitPreparedStringBytesOperand(expression.args[0], context, 'ccjs_url_param_name')
  }

  pushUrlLines(lines, receiver.lines)
  lines.push(emitRuntimeTypeCheck(`${receiver.expression}.tag != CCJS_TAG_OBJECT || ${receiver.expression}.as.ref == 0`, context))

  if (name != null) {
    pushUrlLines(lines, name.lines)
  }

  const nameBytes = urlStringBytes(name)
  const nameLength = urlStringLength(name)

  if (method === 'URLSearchParams.has') {
    const out = urlOutName(options, context, 'ccjs_url_param_has')
    lines.push(`int ${out} = 0;`)
    lines.push(
      emitStatusCheck(
        `ccjs_url_search_params_has(${receiver.expression}, ${nameBytes}, ${nameLength}, &${out})`,
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
    const out = urlOutName(options, context, 'ccjs_url_param_value')
    let call = `ccjs_url_search_params_to_string(&ccjs_default_allocator, ${receiver.expression}, &${out})`
    let nullable = false

    if (options.owned !== false) {
      registerOwnedValue(context, out)
    }

    if (method === 'URLSearchParams.get') {
      call = `ccjs_url_search_params_get(&ccjs_default_allocator, ${receiver.expression}, ${nameBytes}, ${nameLength}, &${out})`
      nullable = true
    }

    pushUrlLines(lines, emitPrepareOwnedValueWrite(out))
    lines.push(emitStatusCheck(call, context))

    return {
      lines,
      expression: out,
      valueType: 'string',
      nullable
    }
  }

  if (method === 'URLSearchParams.delete') {
    lines.push(
      emitStatusCheck(
        `ccjs_url_search_params_delete(&ccjs_default_allocator, ${receiver.expression}, ${nameBytes}, ${nameLength})`,
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
  let call = `ccjs_url_search_params_append(&ccjs_default_allocator, ${receiver.expression}, ${nameBytes}, ${nameLength}, ${value.bytes}, ${value.length})`

  if (method === 'URLSearchParams.set') {
    call = `ccjs_url_search_params_set(&ccjs_default_allocator, ${receiver.expression}, ${nameBytes}, ${nameLength}, ${value.bytes}, ${value.length})`
  }

  pushUrlLines(lines, value.lines)
  lines.push(emitStatusCheck(call, context))

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
  if (expression.type !== 'AssignmentExpression' || expression.urlRuntimeMethod !== 'URL.setField') {
    return null
  }

  const field: string = expression.urlRuntimeField
  const fieldIndex = urlObjectFieldIndex(field)

  if (fieldIndex === -1 || !isMutableUrlObjectField(field)) {
    return null
  }

  const object = dependencies.emitCValueExpression(expression.target.object, context)
  const value = dependencies.emitCValueExpression(expression.value, context)
  const lines: string[] = []

  pushUrlLines(lines, object.lines)
  pushUrlLines(lines, value.lines)
  lines.push(
    emitStatusCheck(
      `ccjs_url_set_field(&ccjs_default_allocator, ${object.expression}, ${fieldIndex}, ${value.expression})`,
      context
    )
  )

  return lines
}

function emitUrlObjectShape(context: CFunctionContext): PreparedExpression {
  const shapeName = nextCName(context, 'ccjs_shape_url')
  const fieldsName = `${shapeName}_fields`
  const lines: string[] = []

  lines.push(`static const ccjs_field_info ${fieldsName}[] = {`)
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
  const lines: string[] = []

  lines.push(`static const ccjs_field_info ${fieldsName}[] = {`)
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
