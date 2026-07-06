import { urlMutableObjectFields, urlObjectFields } from './descriptor.ts'
import type { AnyNode } from '../../../../compiler/types.ts'
import type { CFunctionContext } from '../../../../compiler/c/context.ts'
import {
  emitRuntimeTypeCheck,
  nextCName
} from '../../../../compiler/c/context.ts'
import { cStringLiteral } from '../../../../compiler/c/identifiers.ts'
import type {
  CObjectShape,
  CPreparedCallOptions as PreparedCallOptions,
  CPreparedExpression as PreparedExpression,
  CPreparedStringBytesOperand as PreparedStringBytesOperand
} from '../../../../compiler/c/types.ts'

export type UrlLoweringDependencies = {
  emitCValueExpression: (expression: AnyNode, context: CFunctionContext) => PreparedExpression
  emitPreparedStringBytesOperand: (
    expression: AnyNode,
    context: CFunctionContext,
    tempPrefix: string
  ) => PreparedStringBytesOperand
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

function isUrlSearchParamsReference(expression: AnyNode | null | undefined, context: CFunctionContext): boolean {
  if (
    expression === null ||
    typeof expression === 'undefined' ||
    expression.type !== 'Reference' ||
    expression.path.length !== 1
  ) {
    return false
  }

  const name = expression.path[0]

  return context.objectDeclaredTypes.get(name) === 'url.URLSearchParams'
}

function urlOutName(options: PreparedCallOptions, context: CFunctionContext, prefix: string): string {
  let out = nextCName(context, prefix)

  if (options.out !== null && typeof options.out !== 'undefined') {
    out = options.out
  }

  return out
}

function urlStringBytes(prepared: PreparedStringBytesOperand | null): string {
  let bytes = '""'

  if (prepared !== null && typeof prepared !== 'undefined') {
    bytes = prepared.bytes
  }

  return bytes
}

function urlStringLength(prepared: PreparedStringBytesOperand | null): string {
  let length = '0'

  if (prepared !== null && typeof prepared !== 'undefined') {
    length = prepared.length
  }

  return length
}

function urlStringArgument(prepared: PreparedStringBytesOperand | null): string {
  let cppExpression = ''
  let hasCppExpression = false

  if (prepared !== null && typeof prepared !== 'undefined') {
    const candidate = prepared.cppExpression

    if (candidate !== null && typeof candidate !== 'undefined') {
      cppExpression = candidate
      hasCppExpression = true
    }
  }

  if (hasCppExpression) {
    return cppExpression
  }

  return `inox::StringView(${urlStringBytes(prepared)}, ${urlStringLength(prepared)})`
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
    if (stringArrayValueAt(urlObjectFields, index) === field) {
      return index
    }
  }

  return -1
}

function isMutableUrlObjectField(field: string): boolean {
  for (let index = 0; index < urlMutableObjectFields.length; index = index + 1) {
    if (stringArrayValueAt(urlMutableObjectFields, index) === field) {
      return true
    }
  }

  return false
}

function stringArrayValueAt(values: string[], index: number): string {
  return values[index]
}

export function cUrlRuntimeMethodName(expression: AnyNode | null | undefined): string | null {
  if (
    expression === null ||
    typeof expression === 'undefined' ||
    (expression.type !== 'CallExpression' && expression.type !== 'NewExpression')
  ) {
    return null
  }

  if (expression.urlRuntimeMethod === null || typeof expression.urlRuntimeMethod === 'undefined') {
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
  const out = urlOutName(options, context, 'inox_url_path')
  const lines: string[] = []

  pushUrlLines(lines, arg.lines)
  lines.push(`auto ${out} = url.fileURLToPath(${arg.expression});`)
  lines.push(emitRuntimeTypeCheck('inox::thrown()', context))

  return {
    lines,
    expression: out,
    cppType: 'inox::String',
    valueType: 'string'
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

  const out = urlOutName(options, context, 'inox_url_object')
  const input = dependencies.emitCValueExpression(expression.args[0], context)
  const shape = emitUrlObjectShape(context)
  const lines: string[] = []

  pushUrlLines(lines, input.lines)
  pushUrlLines(lines, shape.lines)

  context.variables.set(out, 'object')
  context.objectDeclaredTypes.set(out, 'url.URL')
  dependencies.registerObjectShape(context, out, expression.shape)

  if (method === 'pathToFileURL') {
    lines.push(`auto ${out} = url.pathToFileURL(${input.expression}, ${shape.expression});`)
    lines.push(emitRuntimeTypeCheck('inox::thrown()', context))

    return {
      lines,
      expression: out,
      cppType: 'URL',
      valueType: 'object'
    }
  }

  let base = emptyPreparedUrlExpression('inox_undefined_value()')
  let hasBase = '0'

  if (expression.args.length > 1) {
    base = dependencies.emitCValueExpression(expression.args[1], context)
    hasBase = '1'
  }

  pushUrlLines(lines, base.lines)
  lines.push(`auto ${out} = URL::from(${input.expression}, ${base.expression}, ${hasBase === '1' ? 'true' : 'false'}, ${shape.expression});`)
  lines.push(emitRuntimeTypeCheck('inox::thrown()', context))

  return {
    lines,
    expression: out,
    cppType: 'URL',
    valueType: 'object'
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

  const out = urlOutName(options, context, 'url_search_params')
  let init = emptyPreparedUrlExpression('')
  const lines: string[] = []
  let constructorExpression = 'URLSearchParams::from(inox_undefined_value())'

  if (expression.args.length > 0) {
    const arg = expression.args[0]

    if (arg.type === 'StringLiteral') {
      constructorExpression = `URLSearchParams(${cStringLiteral(arg.value)})`
    } else {
      init = dependencies.emitCValueExpression(arg, context)
      constructorExpression = `URLSearchParams::from(${init.expression})`
    }
  }

  pushUrlLines(lines, init.lines)

  if (options.out !== null && typeof options.out !== 'undefined') {
    lines.push(`auto ${out} = ${constructorExpression};`)
    lines.push(emitRuntimeTypeCheck(`!${out}.valid()`, context))
    context.variables.set(out, 'object')
    context.objectDeclaredTypes.set(out, 'url.URLSearchParams')
    dependencies.registerObjectShape(context, out, expression.shape)

    return {
      lines,
      expression: out,
      cppType: 'URLSearchParams',
      valueType: 'object'
    }
  }

  return {
    lines,
    expression: constructorExpression,
    cppType: 'URLSearchParams',
    valueType: 'object'
  }
}

export function emitPreparedUrlSearchParamsCallExpression(
  expression: AnyNode,
  context: CFunctionContext,
  dependencies: UrlLoweringDependencies,
  options: PreparedCallOptions = {}
): PreparedExpression | null {
  const method = cUrlRuntimeMethodName(expression)

  if (method === null || typeof method === 'undefined' || !isUrlSearchParamsRuntimeCall(method)) {
    return null
  }

  const receiverObject = expression.callee.object
  const receiver = dependencies.emitCValueExpression(receiverObject, context)
  let name: PreparedStringBytesOperand | null = null
  const lines: string[] = []

  if (expression.args.length > 0) {
    name = dependencies.emitPreparedStringBytesOperand(expression.args[0], context, 'inox_url_param_name')
  }

  pushUrlLines(lines, receiver.lines)

  if (name !== null && typeof name !== 'undefined') {
    pushUrlLines(lines, name.lines)
  }

  const nameArg = urlStringArgument(name)
  const receiverExpression =
    receiver.cppType === 'URLSearchParams' || isUrlSearchParamsReference(receiverObject, context)
      ? receiver.expression
      : `URLSearchParams(inox::Value(${receiver.expression}))`

  if (method === 'URLSearchParams.has') {
    const out = urlOutName(options, context, 'inox_url_param_has')
    lines.push(`bool ${out} = ${receiverExpression}.has(${nameArg});`)
    lines.push(emitRuntimeTypeCheck('inox::thrown()', context))

    return {
      lines,
      expression: out,
      valueType: 'boolean'
    }
  }

  if (method === 'URLSearchParams.get' || method === 'URLSearchParams.toString') {
    const out = urlOutName(options, context, 'inox_url_param_value')
    let call = `${receiverExpression}.toString()`
    let nullable = false

    if (method === 'URLSearchParams.get') {
      call = `${receiverExpression}.get(${nameArg})`
      nullable = true
    }

    lines.push(`auto ${out} = ${call};`)
    lines.push(emitRuntimeTypeCheck('inox::thrown()', context))

    return {
      lines,
      expression: out,
      cppType: method === 'URLSearchParams.toString' ? 'inox::String' : 'inox::Value',
      valueType: 'string',
      nullable
    }
  }

  if (method === 'URLSearchParams.delete') {
    lines.push(`${receiverExpression}.remove(${nameArg});`)
    lines.push(emitRuntimeTypeCheck('inox::thrown()', context))

    return {
      lines,
      expression: '',
      valueType: 'void'
    }
  }

  const value = dependencies.emitPreparedStringBytesOperand(expression.args[1], context, 'inox_url_param_value')
  const valueArg = urlStringArgument(value)
  let call = `${receiverExpression}.append(${nameArg}, ${valueArg})`

  if (method === 'URLSearchParams.set') {
    call = `${receiverExpression}.set(${nameArg}, ${valueArg})`
  }

  pushUrlLines(lines, value.lines)
  lines.push(`${call};`)
  lines.push(emitRuntimeTypeCheck('inox::thrown()', context))

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

  const field = expression.urlRuntimeField

  if (field === null || typeof field === 'undefined') {
    return null
  }

  const fieldIndex = urlObjectFieldIndex(field)

  if (fieldIndex === -1 || !isMutableUrlObjectField(field)) {
    return null
  }

  const object = dependencies.emitCValueExpression(expression.target.object, context)
  const value = dependencies.emitCValueExpression(expression.value, context)
  const lines: string[] = []

  pushUrlLines(lines, object.lines)
  pushUrlLines(lines, value.lines)
  lines.push(`URL(${object.expression}).setField(${fieldIndex}, ${value.expression});`)
  lines.push(emitRuntimeTypeCheck('inox::thrown()', context))

  return lines
}

function emitUrlObjectShape(context: CFunctionContext): PreparedExpression {
  const shapeName = nextCName(context, 'inox_shape_url')
  const fieldsName = `${shapeName}_fields`
  const lines: string[] = []

  lines.push(`static const inox_field_info ${fieldsName}[] = {`)
  const fields: string[] = urlObjectFields

  for (const field of fields) {
    lines.push(`  { ${cStringLiteral(field)}, INOX_FIELD_READONLY },`)
  }

  lines.push('};')
  lines.push(`static const inox_shape ${shapeName} = {`)
  lines.push(`  ${urlObjectFields.length},`)
  lines.push(`  ${fieldsName}`)
  lines.push('};')

  return {
    lines,
    expression: `&${shapeName}`
  }
}
