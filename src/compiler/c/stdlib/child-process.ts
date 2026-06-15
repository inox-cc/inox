import {
  emitPrepareOwnedValueWrite,
  emitStatusCheck,
  nextCName,
  registerOwnedValue,
  type CFunctionContext
} from '../context.ts'
import type { CPreparedExpression as PreparedExpression } from '../types.ts'

type PreparedCallOptions = {
  out?: string
  owned?: boolean
}

export type ChildProcessLoweringDependencies = {
  emitCValueExpression: (expression: any, context: CFunctionContext) => PreparedExpression
  registerObjectShape: (context: CFunctionContext, name: string, shape: any) => void
}

export function cChildProcessRuntimeMethodName(expression: any): string | null {
  if (expression?.type !== 'CallExpression' || typeof expression.childProcessRuntimeMethod !== 'string') {
    return null
  }

  return expression.childProcessRuntimeMethod
}

export function emitPreparedChildProcessCallExpression(
  expression: any,
  context: CFunctionContext,
  dependencies: ChildProcessLoweringDependencies,
  options: PreparedCallOptions = {}
): PreparedExpression | null {
  const method = cChildProcessRuntimeMethodName(expression)

  if (method == null) {
    return null
  }

  const command = dependencies.emitCValueExpression(expression.args[0], context)
  const out = options.out ?? nextCName(context, 'ccjs_child_process_output')
  const lines = [...command.lines, ...emitPrepareOwnedValueWrite(out)]

  if (options.owned !== false) {
    registerOwnedValue(context, out)
  }

  if (method === 'execSync') {
    const childOptions = dependencies.emitCValueExpression(expression.args[1], context)
    lines.push(...childOptions.lines)
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

  const second = expression.args[1]
  const argArray = second?.type === 'ObjectLiteral' ? null : second
  const optionsArg = second?.type === 'ObjectLiteral' ? second : expression.args[2]
  const childOptions =
    optionsArg == null
      ? { lines: [] as string[], expression: 'ccjs_undefined_value()' }
      : dependencies.emitCValueExpression(optionsArg, context)
  const args =
    argArray?.type === 'ArrayLiteral'
      ? argArray.elements.map((arg: any) => dependencies.emitCValueExpression(arg, context))
      : []

  lines.push(...args.flatMap((arg: PreparedExpression) => arg.lines))
  lines.push(...childOptions.lines)

  if (method === 'spawnSync') {
    const shape = emitChildProcessSpawnSyncResultShape(context)
    context.variables.set(out, 'object')
    dependencies.registerObjectShape(context, out, expression.shape)
    lines.push(...shape.lines)

    if (args.length === 0) {
      lines.push(
        emitStatusCheck(
          `ccjs_child_process_spawn_sync(&ccjs_default_allocator, ${command.expression}, 0, 0, ${childOptions.expression}, ${shape.expression}, &${out})`,
          context
        )
      )
    } else {
      const argsName = nextCName(context, 'ccjs_child_process_args')

      lines.push(`ccjs_value ${argsName}[] = { ${args.map((arg: PreparedExpression) => arg.expression).join(', ')} };`)
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

    lines.push(`ccjs_value ${argsName}[] = { ${args.map((arg: PreparedExpression) => arg.expression).join(', ')} };`)
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
