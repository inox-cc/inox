import { pathRuntimeConstantValue } from './descriptor.ts'
import type { AnyNode } from '../../../../compiler/types.ts'
import { emitPrepareOwnedValueWrite, nextCName, registerOwnedValue } from '../../../../compiler/c/context.ts'
import { cStringLiteral } from '../../../../compiler/c/identifiers.ts'
import type {
  CObjectShape,
  CObjectShapeField,
  CPreparedCallOptions as PreparedCallOptions,
  CPreparedExpression as PreparedExpression
} from '../../../../compiler/c/types.ts'

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
  variables: Map<string, string>
}

export type PathLoweringDependencies = {
  emitCValueExpression(expression: AnyNode, context: PathCContext): PreparedExpression
  registerObjectShape(context: PathCContext, name: string, shape: CObjectShape | null | undefined): void
}

export function cPathRuntimeMethodName(expression: AnyNode | null | undefined): string | null {
  if (expression === null || typeof expression === 'undefined' || expression.type !== 'CallExpression') {
    return null
  }

  const method = expression.pathRuntimeMethod

  if (method !== null && typeof method !== 'undefined') {
    return method
  }

  return null
}

export function cPathRuntimeConstantName(expression: AnyNode | null | undefined): string | null {
  if (expression === null || typeof expression === 'undefined') {
    return null
  }

  const constant = expression.pathRuntimeConstant

  if (constant !== null && typeof constant !== 'undefined') {
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

  if (constant !== null && typeof constant !== 'undefined') {
    value = cPathRuntimeConstantValue(constant)
  }

  if (value === null || typeof value === 'undefined') {
    return null
  }

  return {
    lines: [],
    expression: value === '/' ? 'path.sep' : 'path.delimiter',
    cppType: 'inox::String',
    owned: false
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

  let out = nextCName(context, 'inox_path_object')

  if (
    options !== null &&
    typeof options !== 'undefined' &&
    options.out !== null &&
    typeof options.out !== 'undefined'
  ) {
    out = options.out
  }

  const input = dependencies.emitCValueExpression(expression.args[0], context)
  const shape = emitPathParseObjectShape(context)
  const lines: string[] = []

  pushLines(lines, input.lines)
  pushLines(lines, shape.lines)
  pushLines(lines, emitPrepareOwnedValueWrite(out))

  if (options === null || typeof options === 'undefined' || options.owned !== false) {
    registerOwnedValue(context, out)
  }

  context.variables.set(out, 'object')
  dependencies.registerObjectShape(context, out, expression.shape)

  lines.push(`${out} = path.parse(${input.expression}, ${shape.expression});`)

  return {
    lines,
    expression: out,
    cppType: 'inox::Value'
  }
}

export function emitPreparedPathStringCallExpression(
  expression: AnyNode,
  context: PathCContext,
  dependencies: PathLoweringDependencies,
  options: PreparedCallOptions | null | undefined
): PreparedExpression | null {
  const method = cPathRuntimeMethodName(expression)

  if (method === null || typeof method === 'undefined' || method === 'isAbsolute' || method === 'parse') {
    return null
  }

  const lines: string[] = []

  if (method === 'join' || method === 'resolve') {
    const args: PreparedExpression[] = []

    for (let index = 0; index < expression.args.length; index = index + 1) {
      const arg = expression.args[index]
      args.push(dependencies.emitCValueExpression(arg, context))
    }

    for (let index = 0; index < args.length; index = index + 1) {
      const arg = args[index]
      pushLines(lines, arg.lines)
    }

    if (args.length === 0) {
      return {
        lines,
        expression: `path.${method}(nullptr, 0)`,
        cppType: 'inox::String',
        owned: false
      }
    } else {
      const argArray = nextCName(context, 'inox_path_args')
      const expressions: string[] = []

      for (let index = 0; index < args.length; index = index + 1) {
        const arg = args[index]
        expressions.push(arg.expression)
      }

      lines.push(`const inox_value ${argArray}[] = { ${joinStrings(expressions, ', ')} };`)

      return {
        lines,
        expression: `path.${method}(${argArray}, ${args.length})`,
        cppType: 'inox::String',
        owned: false
      }
    }
  }

  if (method === 'format') {
    const object = dependencies.emitCValueExpression(expression.args[0], context)

    pushLines(lines, object.lines)

    return {
      lines,
      expression: `path.format(${object.expression})`,
      cppType: 'inox::String',
      owned: false
    }
  }

  const first = dependencies.emitCValueExpression(expression.args[0], context)

  pushLines(lines, first.lines)

  if (method === 'basename') {
    let suffix: PreparedExpression = {
      lines: [],
      expression: 'inox_undefined_value()'
    }
    let suffixPresent = '0'

    if (expression.args[1] !== null && typeof expression.args[1] !== 'undefined') {
      suffix = dependencies.emitCValueExpression(expression.args[1], context)
      suffixPresent = '1'
    }

    pushLines(lines, suffix.lines)

    return {
      lines,
      expression: `path.basename(${first.expression}, ${suffix.expression}, ${suffixPresent === '1' ? 'true' : 'false'})`,
      cppType: 'inox::String',
      owned: false
    }
  }

  if (method === 'relative') {
    const to = dependencies.emitCValueExpression(expression.args[1], context)

    pushLines(lines, to.lines)

    return {
      lines,
      expression: `path.relative(${first.expression}, ${to.expression})`,
      cppType: 'inox::String',
      owned: false
    }
  }

  return {
    lines,
    expression: `path.${method}(${first.expression})`,
    cppType: 'inox::String',
    owned: false
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
  const lines: string[] = []

  pushLines(lines, value.lines)

  return {
    lines,
    expression: `path.isAbsolute(${value.expression})`
  }
}

function emitPathParseObjectShape(context: PathCContext): PreparedExpression {
  const shapeName = nextCName(context, 'inox_shape_path_parse')
  const fieldsName = `${shapeName}_fields`
  const lines = [`static const inox_field_info ${fieldsName}[] = {`]

  lines.push(`  { ${cStringLiteral('root')}, INOX_FIELD_READONLY },`)
  lines.push(`  { ${cStringLiteral('dir')}, INOX_FIELD_READONLY },`)
  lines.push(`  { ${cStringLiteral('base')}, INOX_FIELD_READONLY },`)
  lines.push(`  { ${cStringLiteral('ext')}, INOX_FIELD_READONLY },`)
  lines.push(`  { ${cStringLiteral('name')}, INOX_FIELD_READONLY },`)

  lines.push('};')
  lines.push(`static const inox_shape ${shapeName} = {`)
  lines.push('  5,')
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
