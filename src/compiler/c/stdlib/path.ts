import { pathParseObjectFields, pathRuntimeConstantValue } from '../../stdlib/descriptors/path.ts'
import {
  emitPrepareOwnedValueWrite,
  emitStatusCheck,
  nextCName,
  registerOwnedValue,
  type CFunctionContext
} from '../context.ts'
import { cStringLiteral, utf8ByteLength } from '../identifiers.ts'
import type { CPreparedExpression as PreparedExpression } from '../types.ts'

type PreparedCallOptions = {
  out?: string
  owned?: boolean
}

export type PathLoweringDependencies = {
  emitCValueExpression: (expression: any, context: CFunctionContext) => PreparedExpression
  registerObjectShape: (context: CFunctionContext, name: string, shape: any) => void
}

export function cPathRuntimeMethodName(expression: any): string | null {
  if (expression?.type !== 'CallExpression' || typeof expression.pathRuntimeMethod !== 'string') {
    return null
  }

  return expression.pathRuntimeMethod
}

export function cPathRuntimeConstantName(expression: any): string | null {
  if (typeof expression?.pathRuntimeConstant !== 'string') {
    return null
  }

  return expression.pathRuntimeConstant
}

export function cPathRuntimeConstantValue(name: string): string | null {
  if (name !== 'delimiter' && name !== 'sep') {
    return null
  }

  return pathRuntimeConstantValue(name)
}

export function emitPreparedPathConstantExpression(expression: any, context: CFunctionContext): PreparedExpression | null {
  const constant = cPathRuntimeConstantName(expression)
  const value = constant == null ? null : cPathRuntimeConstantValue(constant)

  if (value == null) {
    return null
  }

  const out = nextCName(context, 'ccjs_path_constant')
  registerOwnedValue(context, out)

  return {
    lines: [
      ...emitPrepareOwnedValueWrite(out),
      emitStatusCheck(
        `ccjs_string_from_literal(&ccjs_default_allocator, ${cStringLiteral(value)}, ${utf8ByteLength(value)}, &${out})`,
        context
      )
    ],
    expression: out
  }
}

export function emitPreparedPathObjectCallExpression(
  expression: any,
  context: CFunctionContext,
  dependencies: PathLoweringDependencies,
  options: PreparedCallOptions = {}
): PreparedExpression | null {
  if (cPathRuntimeMethodName(expression) !== 'parse') {
    return null
  }

  const out = options.out ?? nextCName(context, 'ccjs_path_object')
  const input = dependencies.emitCValueExpression(expression.args[0], context)
  const shape = emitPathParseObjectShape(context)
  const lines = [...input.lines, ...shape.lines, ...emitPrepareOwnedValueWrite(out)]

  if (options.owned !== false) {
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
  expression: any,
  context: CFunctionContext,
  dependencies: PathLoweringDependencies,
  options: PreparedCallOptions = {}
): PreparedExpression | null {
  const method = cPathRuntimeMethodName(expression)

  if (method == null || method === 'isAbsolute' || method === 'parse') {
    return null
  }

  const out = options.out ?? nextCName(context, 'ccjs_path_value')
  const lines: string[] = []

  if (options.owned !== false) {
    registerOwnedValue(context, out)
  }

  if (method === 'join' || method === 'resolve') {
    const args = expression.args.map((arg: any) => dependencies.emitCValueExpression(arg, context))

    lines.push(...args.flatMap((arg: PreparedExpression) => arg.lines))
    lines.push(...emitPrepareOwnedValueWrite(out))

    if (args.length === 0) {
      lines.push(emitStatusCheck(`ccjs_path_${method}(&ccjs_default_allocator, 0, 0, &${out})`, context))
    } else {
      const argArray = nextCName(context, 'ccjs_path_args')

      lines.push(`ccjs_value ${argArray}[] = { ${args.map((arg: PreparedExpression) => arg.expression).join(', ')} };`)
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

    lines.push(...object.lines)
    lines.push(...emitPrepareOwnedValueWrite(out))
    lines.push(emitStatusCheck(`ccjs_path_format(&ccjs_default_allocator, ${object.expression}, &${out})`, context))

    return {
      lines,
      expression: out
    }
  }

  const first = dependencies.emitCValueExpression(expression.args[0], context)

  lines.push(...first.lines)
  lines.push(...emitPrepareOwnedValueWrite(out))

  if (method === 'basename') {
    const suffix =
      expression.args[1] == null
        ? { lines: [] as string[], expression: 'ccjs_undefined_value()' }
        : dependencies.emitCValueExpression(expression.args[1], context)

    lines.push(...suffix.lines)
    lines.push(
      emitStatusCheck(
        `ccjs_path_basename(&ccjs_default_allocator, ${first.expression}, ${suffix.expression}, ${expression.args[1] == null ? '0' : '1'}, &${out})`,
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

    lines.push(...to.lines)
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
  expression: any,
  context: CFunctionContext,
  dependencies: PathLoweringDependencies
): PreparedExpression | null {
  if (cPathRuntimeMethodName(expression) !== 'isAbsolute') {
    return null
  }

  const value = dependencies.emitCValueExpression(expression.args[0], context)
  const out = nextCName(context, 'ccjs_path_is_absolute')

  return {
    lines: [
      ...value.lines,
      `int ${out} = 0;`,
      emitStatusCheck(`ccjs_path_is_absolute(${value.expression}, &${out})`, context)
    ],
    expression: `(${out} ? 1 : 0)`
  }
}

function emitPathParseObjectShape(context: CFunctionContext): PreparedExpression {
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
