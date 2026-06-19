import type { AnyNode } from '../../types.ts'
import { emitPrepareOwnedValueWrite, emitStatusCheck, nextCName, registerOwnedValue } from '../context.ts'
import type { CFunctionContext } from '../context.ts'
import type {
  CObjectShape,
  CPreparedCallOptions as PreparedCallOptions,
  CPreparedExpression as PreparedExpression
} from '../types.ts'

export type ChildProcessLoweringDependencies = {
  emitCValueExpression: (expression: AnyNode, context: CFunctionContext) => PreparedExpression
  registerObjectShape: (context: CFunctionContext, name: string, shape: CObjectShape | null | undefined) => void
}

function pushChildProcessLines(target: string[], lines: string[]): void {
  for (const line of lines) {
    target.push(line)
  }
}

function emitChildProcessArgumentArray(args: PreparedExpression[]): string {
  let output = ''

  for (let index = 0; index < args.length; index = index + 1) {
    if (index === 0) {
      output = args[index].expression
    } else {
      output = `${output}, ${args[index].expression}`
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

  const command = dependencies.emitCValueExpression(expression.args[0], context)
  let out = nextCName(context, 'inox_child_process_output')

  if (options.out !== null && typeof options.out !== 'undefined') {
    out = options.out
  }

  const lines: string[] = []

  pushChildProcessLines(lines, command.lines)
  pushChildProcessLines(lines, emitPrepareOwnedValueWrite(out))

  if (options.owned !== false) {
    registerOwnedValue(context, out)
  }

  if (method === 'execSync') {
    const childOptions = dependencies.emitCValueExpression(expression.args[1], context)
    pushChildProcessLines(lines, childOptions.lines)
    lines.push(
      emitStatusCheck(
        `inox_child_process_exec_sync(&inox_default_allocator, ${command.expression}, ${childOptions.expression}, &${out})`,
        context
      )
    )

    return {
      lines,
      expression: out
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
    expression: 'inox_undefined_value()'
  }

  if (optionsArg !== null && typeof optionsArg !== 'undefined') {
    childOptions = dependencies.emitCValueExpression(optionsArg, context)
  }

  const args: PreparedExpression[] = []

  if (argArray !== null && typeof argArray !== 'undefined' && argArray.type === 'ArrayLiteral') {
    for (let index = 0; index < argArray.elements.length; index = index + 1) {
      const arg = argArray.elements[index]
      args.push(dependencies.emitCValueExpression(arg, context))
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
        emitStatusCheck(
          `inox_child_process_spawn_sync(&inox_default_allocator, ${command.expression}, 0, 0, ${childOptions.expression}, ${shape.expression}, &${out})`,
          context
        )
      )
    } else {
      const argsName = nextCName(context, 'inox_child_process_args')
      const argsValue = emitChildProcessArgumentArray(args)

      lines.push(`inox_value ${argsName}[] = { ${argsValue} };`)
      lines.push(
        emitStatusCheck(
          `inox_child_process_spawn_sync(&inox_default_allocator, ${command.expression}, ${argsName}, ${args.length}, ${childOptions.expression}, ${shape.expression}, &${out})`,
          context
        )
      )
    }

    return {
      lines,
      expression: out
    }
  }

  if (args.length === 0) {
    lines.push(
      emitStatusCheck(
        `inox_child_process_exec_file_sync(&inox_default_allocator, ${command.expression}, 0, 0, ${childOptions.expression}, &${out})`,
        context
      )
    )
  } else {
    const argsName = nextCName(context, 'inox_child_process_args')
    const argsValue = emitChildProcessArgumentArray(args)

    lines.push(`inox_value ${argsName}[] = { ${argsValue} };`)
    lines.push(
      emitStatusCheck(
        `inox_child_process_exec_file_sync(&inox_default_allocator, ${command.expression}, ${argsName}, ${args.length}, ${childOptions.expression}, &${out})`,
        context
      )
    )
  }

  return {
    lines,
    expression: out
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
