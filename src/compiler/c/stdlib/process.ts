import {
  isProcessRuntimeNumberProperty,
  isProcessRuntimeStringProperty,
  processRuntimePropertyValueType
} from '../../stdlib/descriptors/process.ts'
import type { AnyNode } from '../../types.ts'
import {
  emitPrepareOwnedValueWrite,
  emitStatusCheck,
  nextCName,
  registerOwnedValue,
  type CFunctionContext
} from '../context.ts'
import { cStringLiteral, utf8ByteLength } from '../identifiers.ts'
import type {
  CPreparedCallOptions as PreparedCallOptions,
  CPreparedExpression as PreparedExpression
} from '../types.ts'

export type ProcessLoweringDependencies = {
  emitPreparedNumberExpression: (expression: AnyNode, context: CFunctionContext) => PreparedExpression
}

export function cProcessRuntimeMethodName(expression: AnyNode): string | null {
  if (expression?.type !== 'CallExpression' || typeof expression.processRuntimeMethod !== 'string') {
    return null
  }

  return expression.processRuntimeMethod
}

export function cProcessRuntimePropertyName(expression: AnyNode): string | null {
  if (typeof expression?.processRuntimeProperty !== 'string') {
    return null
  }

  return expression.processRuntimeProperty
}

export function cProcessRuntimePropertyValueType(expression: AnyNode): 'string' | 'number' | 'object' | null {
  const property = cProcessRuntimePropertyName(expression)

  return property == null ? null : processRuntimePropertyValueType(property)
}

export function cProcessRuntimeStringPropertyName(expression: AnyNode): string | null {
  const property = cProcessRuntimePropertyName(expression)

  return property != null && isProcessRuntimeStringProperty(property) ? property : null
}

export function cProcessRuntimeNumberPropertyName(expression: AnyNode): string | null {
  const property = cProcessRuntimePropertyName(expression)

  return property != null && isProcessRuntimeNumberProperty(property) ? property : null
}

export function cProcessRuntimeStringFunctionName(property: string): string | null {
  if (property === 'versions.node') {
    return 'versions_node'
  }

  return isProcessRuntimeStringProperty(property) ? property : null
}

export function cProcessRuntimeEnvName(expression: AnyNode): string | null {
  return typeof expression?.processRuntimeEnvName === 'string' ? expression.processRuntimeEnvName : null
}

export function emitPreparedProcessStringExpression(
  expression: AnyNode,
  context: CFunctionContext,
  dependencies: ProcessLoweringDependencies,
  options: PreparedCallOptions = {}
): PreparedExpression | null {
  const method = cProcessRuntimeMethodName(expression)
  const property = cProcessRuntimePropertyName(expression)
  const stringProperty = cProcessRuntimeStringPropertyName(expression)
  const envName = cProcessRuntimeEnvName(expression)

  if (
    method !== 'cwd' &&
    !(property === 'argv' && expression?.type === 'IndexExpression') &&
    stringProperty == null &&
    envName == null
  ) {
    return null
  }

  const out = options.out ?? nextCName(context, 'ccjs_process_string')
  const lines: string[] = []

  if (options.owned !== false) {
    registerOwnedValue(context, out)
  }

  lines.push(...emitPrepareOwnedValueWrite(out))

  if (method === 'cwd') {
    lines.push(emitStatusCheck(`ccjs_process_cwd(&ccjs_default_allocator, &${out})`, context))
  } else if (property === 'argv') {
    const index = dependencies.emitPreparedNumberExpression(expression.index, context)

    lines.unshift(...index.lines)
    lines.push(
      emitStatusCheck(`ccjs_process_argv(&ccjs_default_allocator, (int)(${index.expression}), &${out})`, context)
    )
  } else if (stringProperty != null) {
    const functionName = cProcessRuntimeStringFunctionName(stringProperty)

    lines.push(emitStatusCheck(`ccjs_process_${functionName}(&ccjs_default_allocator, &${out})`, context))
  } else {
    const name = envName ?? ''

    lines.push(
      emitStatusCheck(
        `ccjs_process_env(&ccjs_default_allocator, ${cStringLiteral(name)}, ${utf8ByteLength(name)}, &${out})`,
        context
      )
    )
  }

  return {
    lines,
    expression: out
  }
}

export function emitPreparedProcessNumberExpression(expression: AnyNode): PreparedExpression | null {
  const property = cProcessRuntimeNumberPropertyName(expression)

  if (property == null) {
    return null
  }

  if (property === 'argv.length') {
    return {
      lines: [],
      expression: 'ccjs_process_argv_length()'
    }
  }

  if (property === 'pid') {
    return {
      lines: [],
      expression: 'ccjs_process_pid()'
    }
  }

  return {
    lines: [],
    expression: 'ccjs_process_get_exit_code()'
  }
}

export function emitProcessExitStatement(
  expression: AnyNode,
  context: CFunctionContext,
  dependencies: ProcessLoweringDependencies
): string[] | null {
  if (cProcessRuntimeMethodName(expression) !== 'exit') {
    return null
  }

  const code =
    expression.args[0] == null
      ? { lines: [] as string[], expression: '0' }
      : dependencies.emitPreparedNumberExpression(expression.args[0], context)

  return [...code.lines, `ccjs_process_exit((int)(${code.expression}));`]
}

export function emitProcessExitCodeAssignment(
  expression: AnyNode,
  context: CFunctionContext,
  dependencies: ProcessLoweringDependencies
): string[] | null {
  if (expression?.type !== 'AssignmentExpression' || cProcessRuntimePropertyName(expression) !== 'exitCode') {
    return null
  }

  const value = dependencies.emitPreparedNumberExpression(expression.value, context)

  return [...value.lines, `ccjs_process_set_exit_code((int)(${value.expression}));`]
}
