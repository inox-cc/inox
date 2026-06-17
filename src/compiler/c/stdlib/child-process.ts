import type { AnyNode } from '../../types.ts'
import {
  emitPrepareOwnedValueWrite,
  emitStatusCheck,
  nextCName,
  registerOwnedValue
} from '../context.ts'
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
  if (expression == null || expression.type !== 'CallExpression' || expression.childProcessRuntimeMethod == null) {
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

  if (method == null) {
    return null
  }

  const command = dependencies.emitCValueExpression(expression.args[0], context)
  let out = nextCName(context, 'ccjs_child_process_output')

  if (options.out != null) {
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
        `ccjs_child_process_exec_sync(&ccjs_default_allocator, ${command.expression}, ${childOptions.expression}, &${out})`,
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

  if (second != null && second.type === 'ObjectLiteral') {
    argArray = null
    optionsArg = second
  } else if (expression.args.length > 2) {
    optionsArg = expression.args[2]
  }

  let childOptions: PreparedExpression = {
    lines: [],
    expression: 'ccjs_undefined_value()'
  }

  if (optionsArg != null) {
    childOptions = dependencies.emitCValueExpression(optionsArg, context)
  }

  const args: PreparedExpression[] = []

  if (argArray != null && argArray.type === 'ArrayLiteral') {
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
          `ccjs_child_process_spawn_sync(&ccjs_default_allocator, ${command.expression}, 0, 0, ${childOptions.expression}, ${shape.expression}, &${out})`,
          context
        )
      )
    } else {
      const argsName = nextCName(context, 'ccjs_child_process_args')
      const argsValue = emitChildProcessArgumentArray(args)

      lines.push(`ccjs_value ${argsName}[] = { ${argsValue} };`)
      lines.push(
        emitStatusCheck(
          `ccjs_child_process_spawn_sync(&ccjs_default_allocator, ${command.expression}, ${argsName}, ${args.length}, ${childOptions.expression}, ${shape.expression}, &${out})`,
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
        `ccjs_child_process_exec_file_sync(&ccjs_default_allocator, ${command.expression}, 0, 0, ${childOptions.expression}, &${out})`,
        context
      )
    )
  } else {
    const argsName = nextCName(context, 'ccjs_child_process_args')
    const argsValue = emitChildProcessArgumentArray(args)

    lines.push(`ccjs_value ${argsName}[] = { ${argsValue} };`)
    lines.push(
      emitStatusCheck(
        `ccjs_child_process_exec_file_sync(&ccjs_default_allocator, ${command.expression}, ${argsName}, ${args.length}, ${childOptions.expression}, &${out})`,
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
  const shapeName = nextCName(context, 'ccjs_shape_spawn_sync')
  const fieldsName = `${shapeName}_fields`
  const lines = [
    `static const ccjs_field_info ${fieldsName}[] = {`,
    `  { "status", CCJS_FIELD_READONLY },`,
    `  { "stdout", CCJS_FIELD_READONLY },`,
    `  { "stderr", CCJS_FIELD_READONLY },`,
    '};',
    `static const ccjs_shape ${shapeName} = {`,
    '  3,',
    `  ${fieldsName}`,
    '};'
  ]

  return {
    lines,
    expression: `&${shapeName}`
  }
}
