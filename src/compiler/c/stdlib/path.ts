import { pathParseObjectFields, pathRuntimeConstantValue } from '../../stdlib/descriptors/path.ts'
import type { AnyNode } from '../../types.ts'
import {
  emitPrepareOwnedValueWrite,
  emitStatusCheck,
  nextCName,
  registerOwnedValue
} from '../context.ts'
import { cStringLiteral, utf8ByteLength } from '../identifiers.ts'
import type {
  CObjectShape,
  CObjectShapeField,
  CPreparedCallOptions as PreparedCallOptions,
  CPreparedExpression as PreparedExpression
} from '../types.ts'

type PathVariableMap = {
  set(name: string, valueType: string): void
}

type PathCContext = {
  cleanupEnabled: boolean
  failureStatement?: string | null
  failureStatementUsed?: boolean
  nextId: number
  objectShapes: Map<string, CObjectShapeField[]>
  ownedValues: string[]
  returnType?: string
  statusReturn: boolean
  throwingFunction: boolean
  usedCleanupGoto: boolean
  variables: PathVariableMap
}

export type PathLoweringDependencies = {
  emitCValueExpression(expression: AnyNode, context: PathCContext): PreparedExpression
  registerObjectShape(context: PathCContext, name: string, shape: CObjectShape | null | undefined): void
}

export function cPathRuntimeMethodName(expression: AnyNode | null | undefined): string | null {
  if (expression == null || expression.type !== 'CallExpression') {
    return null
  }

  const method = expression.pathRuntimeMethod

  if (method != null) {
    return method
  }

  return null
}

export function cPathRuntimeConstantName(expression: AnyNode | null | undefined): string | null {
  if (expression == null) {
    return null
  }

  const constant = expression.pathRuntimeConstant

  if (constant != null) {
    return constant
  }

  return null
}

export function cPathRuntimeConstantValue(name: string): string | null {
  if (name !== 'delimiter' && name !== 'sep') {
    return null
  }

  return pathRuntimeConstantValue(name)
}

export function emitPreparedPathConstantExpression(
  expression: AnyNode,
  context: PathCContext
): PreparedExpression | null {
  const constant = cPathRuntimeConstantName(expression)
  let value: string | null = null

  if (constant != null) {
    value = cPathRuntimeConstantValue(constant)
  }

  if (value == null) {
    return null
  }

  const out = nextCName(context, 'ccjs_path_constant')
  registerOwnedValue(context, out)

  const lines = emitPrepareOwnedValueWrite(out)
  lines.push(
    emitStatusCheck(
      `ccjs_string_from_literal(&ccjs_default_allocator, ${cStringLiteral(value)}, ${utf8ByteLength(value)}, &${out})`,
      context
    )
  )

  return {
    lines,
    expression: out
  }
}

export function emitPreparedPathObjectCallExpression(
  expression: AnyNode,
  context: PathCContext,
  dependencies: PathLoweringDependencies,
  options: PreparedCallOptions | null | undefined
): PreparedExpression | null {
  if (cPathRuntimeMethodName(expression) !== 'parse') {
    return null
  }

  let out = nextCName(context, 'ccjs_path_object')

  if (options != null && options.out != null) {
    out = options.out
  }

  const input = dependencies.emitCValueExpression(expression.args[0], context)
  const shape = emitPathParseObjectShape(context)
  const lines: string[] = []

  pushLines(lines, input.lines)
  pushLines(lines, shape.lines)
  pushLines(lines, emitPrepareOwnedValueWrite(out))

  if (options == null || options.owned !== false) {
    registerOwnedValue(context, out)
  }

  context.variables.set(out, 'object')
  dependencies.registerObjectShape(context, out, expression.shape)

  lines.push(
    emitStatusCheck(
      `ccjs_path_parse(&ccjs_default_allocator, ${input.expression}, ${shape.expression}, &${out})`,
      context
    )
  )

  return {
    lines,
    expression: out
  }
}

export function emitPreparedPathStringCallExpression(
  expression: AnyNode,
  context: PathCContext,
  dependencies: PathLoweringDependencies,
  options: PreparedCallOptions | null | undefined
): PreparedExpression | null {
  const method = cPathRuntimeMethodName(expression)

  if (method == null || method === 'isAbsolute' || method === 'parse') {
    return null
  }

  let out = nextCName(context, 'ccjs_path_value')
  const lines: string[] = []

  if (options != null && options.out != null) {
    out = options.out
  }

  if (options == null || options.owned !== false) {
    registerOwnedValue(context, out)
  }

  if (method === 'join' || method === 'resolve') {
    const args: PreparedExpression[] = []

    for (const arg of expression.args) {
      args.push(dependencies.emitCValueExpression(arg, context))
    }

    for (const arg of args) {
      pushLines(lines, arg.lines)
    }

    pushLines(lines, emitPrepareOwnedValueWrite(out))

    if (args.length === 0) {
      lines.push(emitStatusCheck(`ccjs_path_${method}(&ccjs_default_allocator, 0, 0, &${out})`, context))
    } else {
      const argArray = nextCName(context, 'ccjs_path_args')
      const expressions: string[] = []

      for (const arg of args) {
        expressions.push(arg.expression)
      }

      lines.push(`ccjs_value ${argArray}[] = { ${joinStrings(expressions, ', ')} };`)
      lines.push(
        emitStatusCheck(`ccjs_path_${method}(&ccjs_default_allocator, ${argArray}, ${args.length}, &${out})`, context)
      )
    }

    return {
      lines,
      expression: out
    }
  }

  if (method === 'format') {
    const object = dependencies.emitCValueExpression(expression.args[0], context)

    pushLines(lines, object.lines)
    pushLines(lines, emitPrepareOwnedValueWrite(out))
    lines.push(emitStatusCheck(`ccjs_path_format(&ccjs_default_allocator, ${object.expression}, &${out})`, context))

    return {
      lines,
      expression: out
    }
  }

  const first = dependencies.emitCValueExpression(expression.args[0], context)

  pushLines(lines, first.lines)
  pushLines(lines, emitPrepareOwnedValueWrite(out))

  if (method === 'basename') {
    let suffix: PreparedExpression = {
      lines: [],
      expression: 'ccjs_undefined_value()'
    }
    let suffixPresent = '0'

    if (expression.args[1] != null) {
      suffix = dependencies.emitCValueExpression(expression.args[1], context)
      suffixPresent = '1'
    }

    pushLines(lines, suffix.lines)
    lines.push(
      emitStatusCheck(
        `ccjs_path_basename(&ccjs_default_allocator, ${first.expression}, ${suffix.expression}, ${suffixPresent}, &${out})`,
        context
      )
    )

    return {
      lines,
      expression: out
    }
  }

  if (method === 'relative') {
    const to = dependencies.emitCValueExpression(expression.args[1], context)

    pushLines(lines, to.lines)
    lines.push(
      emitStatusCheck(
        `ccjs_path_relative(&ccjs_default_allocator, ${first.expression}, ${to.expression}, &${out})`,
        context
      )
    )

    return {
      lines,
      expression: out
    }
  }

  lines.push(emitStatusCheck(`ccjs_path_${method}(&ccjs_default_allocator, ${first.expression}, &${out})`, context))

  return {
    lines,
    expression: out
  }
}

export function emitPreparedPathBooleanCallExpression(
  expression: AnyNode,
  context: PathCContext,
  dependencies: PathLoweringDependencies
): PreparedExpression | null {
  if (cPathRuntimeMethodName(expression) !== 'isAbsolute') {
    return null
  }

  const value = dependencies.emitCValueExpression(expression.args[0], context)
  const out = nextCName(context, 'ccjs_path_is_absolute')
  const lines: string[] = []

  pushLines(lines, value.lines)
  lines.push(`int ${out} = 0;`)
  lines.push(emitStatusCheck(`ccjs_path_is_absolute(${value.expression}, &${out})`, context))

  return {
    lines,
    expression: `(${out} ? 1 : 0)`
  }
}

function emitPathParseObjectShape(context: PathCContext): PreparedExpression {
  const shapeName = nextCName(context, 'ccjs_shape_path_parse')
  const fieldsName = `${shapeName}_fields`
  const lines = [`static const ccjs_field_info ${fieldsName}[] = {`]

  for (const field of pathParseObjectFields) {
    lines.push(`  { ${cStringLiteral(field)}, CCJS_FIELD_READONLY },`)
  }

  lines.push('};')
  lines.push(`static const ccjs_shape ${shapeName} = {`)
  lines.push(`  ${pathParseObjectFields.length},`)
  lines.push(`  ${fieldsName}`)
  lines.push('};')

  return {
    lines,
    expression: `&${shapeName}`
  }
}

function pushLines(target: string[], source: string[]): void {
  for (const line of source) {
    target.push(line)
  }
}

function joinStrings(values: string[], separator: string): string {
  let result = ''

  for (let index = 0; index < values.length; index = index + 1) {
    if (index > 0) {
      result = result + separator
    }

    result = result + values[index]
  }

  return result
}
