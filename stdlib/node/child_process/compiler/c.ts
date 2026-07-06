import type { AnyNode } from '../../../../compiler/types.ts'
import type { CFunctionContext } from '../../../../compiler/c/context.ts'
import { emitRuntimeTypeCheck, nextCName } from '../../../../compiler/c/context.ts'
import type {
  CObjectShape,
  CPreparedCallOptions as PreparedCallOptions,
  CPreparedExpression as PreparedExpression,
  CPreparedStringBytesOperand as PreparedStringBytesOperand
} from '../../../../compiler/c/types.ts'

export type ChildProcessLoweringDependencies = {
  emitCValueExpression: (expression: AnyNode, context: CFunctionContext) => PreparedExpression
  emitPreparedStringBytesOperand(
    expression: AnyNode,
    context: CFunctionContext,
    tempPrefix?: string
  ): PreparedStringBytesOperand
  registerObjectShape: (context: CFunctionContext, name: string, shape: CObjectShape | null | undefined) => void
}

function pushChildProcessLines(target: string[], lines: string[]): void {
  for (const line of lines) {
    target.push(line)
  }
}

function emitChildProcessStringArgument(operand: PreparedStringBytesOperand): string {
  return operand.cppExpression ?? `inox::StringView(${operand.bytes}, ${operand.length})`
}

function emitChildProcessArgumentArray(args: PreparedStringBytesOperand[]): string {
  let output = ''

  for (let index = 0; index < args.length; index = index + 1) {
    if (index === 0) {
      output = emitChildProcessStringArgument(args[index])
    } else {
      output = `${output}, ${emitChildProcessStringArgument(args[index])}`
    }
  }

  return output
}

export function cChildProcessRuntimeMethodName(expression: AnyNode | null | undefined): string | null {
  if (
    expression === null ||
    typeof expression === 'undefined' ||
    expression.type !== 'CallExpression' ||
    expression.childProcessRuntimeMethod === null ||
    typeof expression.childProcessRuntimeMethod === 'undefined'
  ) {
    return null
  }

  return expression.childProcessRuntimeMethod
}

export function emitPreparedChildProcessCallExpression(
  expression: AnyNode,
  context: CFunctionContext,
  dependencies: ChildProcessLoweringDependencies,
  options: PreparedCallOptions = {}
): PreparedExpression | null {
  const method = cChildProcessRuntimeMethodName(expression)

  if (method === null || typeof method === 'undefined') {
    return null
  }

  const command = dependencies.emitPreparedStringBytesOperand(expression.args[0], context, 'inox_child_process_command')
  let out = nextCName(context, 'inox_child_process_output')

  if (options.out !== null && typeof options.out !== 'undefined') {
    out = options.out
  }

  const lines: string[] = []

  pushChildProcessLines(lines, command.lines)

  if (method === 'execSync') {
    const childOptions = dependencies.emitCValueExpression(expression.args[1], context)
    pushChildProcessLines(lines, childOptions.lines)
    lines.push(`auto ${out} = child_process.execSync(${emitChildProcessStringArgument(command)}, ${childOptions.expression});`)
    lines.push(emitRuntimeTypeCheck('inox::thrown()', context))

    return {
      lines,
      expression: out,
      cppType: 'inox::String',
      valueType: 'string'
    }
  }

  let second: AnyNode | null = null

  if (expression.args.length > 1) {
    second = expression.args[1]
  }

  let argArray: AnyNode | null = second
  let optionsArg: AnyNode | null = null

  if (second !== null && typeof second !== 'undefined' && second.type === 'ObjectLiteral') {
    argArray = null
    optionsArg = second
  } else if (expression.args.length > 2) {
    optionsArg = expression.args[2]
  }

  let childOptions: PreparedExpression = {
    lines: [],
    expression: 'inox::Value()'
  }

  if (optionsArg !== null && typeof optionsArg !== 'undefined') {
    childOptions = dependencies.emitCValueExpression(optionsArg, context)
  }

  const args: PreparedStringBytesOperand[] = []

  if (argArray !== null && typeof argArray !== 'undefined' && argArray.type === 'ArrayLiteral') {
    for (let index = 0; index < argArray.elements.length; index = index + 1) {
      const arg = argArray.elements[index]
      args.push(dependencies.emitPreparedStringBytesOperand(arg, context, 'inox_child_process_arg'))
    }
  }

  for (let index = 0; index < args.length; index = index + 1) {
    const arg = args[index]
    pushChildProcessLines(lines, arg.lines)
  }

  pushChildProcessLines(lines, childOptions.lines)

  if (method === 'spawnSync') {
    const shape = emitChildProcessSpawnSyncResultShape(context)
    context.variables.set(out, 'object')
    dependencies.registerObjectShape(context, out, expression.shape)
    pushChildProcessLines(lines, shape.lines)

    if (args.length === 0) {
      lines.push(
        `auto ${out} = child_process.spawnSync(${emitChildProcessStringArgument(command)}, 0, 0, ${childOptions.expression}, ${shape.expression});`
      )
      lines.push(emitRuntimeTypeCheck('inox::thrown()', context))
    } else {
      const argsName = nextCName(context, 'inox_child_process_args')
      const argsValue = emitChildProcessArgumentArray(args)

      lines.push(`inox::StringView ${argsName}[] = { ${argsValue} };`)
      lines.push(
        `auto ${out} = child_process.spawnSync(${emitChildProcessStringArgument(command)}, ${argsName}, ${args.length}, ${childOptions.expression}, ${shape.expression});`
      )
      lines.push(emitRuntimeTypeCheck('inox::thrown()', context))
    }

    return {
      lines,
      expression: out,
      cppType: 'inox::Value',
      valueType: 'object'
    }
  }

  if (args.length === 0) {
    lines.push(
      `auto ${out} = child_process.execFileSync(${emitChildProcessStringArgument(command)}, 0, 0, ${childOptions.expression});`
    )
    lines.push(emitRuntimeTypeCheck('inox::thrown()', context))
  } else {
    const argsName = nextCName(context, 'inox_child_process_args')
    const argsValue = emitChildProcessArgumentArray(args)

    lines.push(`inox::StringView ${argsName}[] = { ${argsValue} };`)
    lines.push(
      `auto ${out} = child_process.execFileSync(${emitChildProcessStringArgument(command)}, ${argsName}, ${args.length}, ${childOptions.expression});`
    )
    lines.push(emitRuntimeTypeCheck('inox::thrown()', context))
  }

  return {
    lines,
    expression: out,
    cppType: 'inox::String',
    valueType: 'string'
  }
}

function emitChildProcessSpawnSyncResultShape(context: CFunctionContext): PreparedExpression {
  const shapeName = nextCName(context, 'inox_shape_spawn_sync')
  const fieldsName = `${shapeName}_fields`
  const lines = [
    `static const inox_field_info ${fieldsName}[] = {`,
    `  { "status", INOX_FIELD_READONLY },`,
    `  { "stdout", INOX_FIELD_READONLY },`,
    `  { "stderr", INOX_FIELD_READONLY },`,
    '};',
    `static const inox_shape ${shapeName} = {`,
    '  3,',
    `  ${fieldsName}`,
    '};'
  ]

  return {
    lines,
    expression: `&${shapeName}`
  }
}
