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
  registerOwnedValue
} from '../context.ts'
import { cStringLiteral, utf8ByteLength } from '../identifiers.ts'
import type {
  CPreparedCallOptions as PreparedCallOptions,
  CPreparedExpression as PreparedExpression
} from '../types.ts'

type ProcessCContext = {
  cleanupEnabled: boolean
  failureStatement?: string | null
  failureStatementUsed?: boolean
  nextId: number
  ownedValues: string[]
  returnType?: string
  statusReturn: boolean
  throwingFunction: boolean
  usedCleanupGoto: boolean
}

export type ProcessLoweringDependencies = {
  emitPreparedNumberExpression(expression: AnyNode, context: ProcessCContext): PreparedExpression
}

export function cProcessRuntimeMethodName(expression: AnyNode | null | undefined): string | null {
  if (expression == null || expression.type !== 'CallExpression') {
    return null
  }

  const method = expression.processRuntimeMethod

  if (method != null) {
    return method
  }

  return null
}

export function cProcessRuntimePropertyName(expression: AnyNode | null | undefined): string | null {
  if (expression == null) {
    return null
  }

  const property = expression.processRuntimeProperty

  if (property != null) {
    return property
  }

  return null
}

export function cProcessRuntimePropertyValueType(expression: AnyNode | null | undefined): string | null {
  const property = cProcessRuntimePropertyName(expression)

  if (property != null) {
    return processRuntimePropertyValueType(property)
  }

  return null
}

export function cProcessRuntimeStringPropertyName(expression: AnyNode | null | undefined): string | null {
  const property = cProcessRuntimePropertyName(expression)

  if (property != null && isProcessRuntimeStringProperty(property)) {
    return property
  }

  return null
}

export function cProcessRuntimeNumberPropertyName(expression: AnyNode | null | undefined): string | null {
  const property = cProcessRuntimePropertyName(expression)

  if (property != null && isProcessRuntimeNumberProperty(property)) {
    return property
  }

  return null
}

export function cProcessRuntimeStringFunctionName(property: string): string | null {
  if (property === 'versions.node') {
    return 'versions_node'
  }

  if (isProcessRuntimeStringProperty(property)) {
    return property
  }

  return null
}

export function cProcessRuntimeEnvName(expression: AnyNode | null | undefined): string | null {
  if (expression == null) {
    return null
  }

  const name = expression.processRuntimeEnvName

  if (name != null) {
    return name
  }

  return null
}

export function emitPreparedProcessStringExpression(
  expression: AnyNode,
  context: ProcessCContext,
  dependencies: ProcessLoweringDependencies,
  options: PreparedCallOptions | null | undefined
): PreparedExpression | null {
  const method = cProcessRuntimeMethodName(expression)
  const property = cProcessRuntimePropertyName(expression)
  const stringProperty = cProcessRuntimeStringPropertyName(expression)
  const envName = cProcessRuntimeEnvName(expression)

  if (
    method !== 'cwd' &&
    !(property === 'argv' && expression.type === 'IndexExpression') &&
    stringProperty == null &&
    envName == null
  ) {
    return null
  }

  let out = nextCName(context, 'ccjs_process_string')
  const lines: string[] = []

  if (options != null && options.out != null) {
    out = options.out
  }

  if (options == null || options.owned !== false) {
    registerOwnedValue(context, out)
  }

  if (method === 'cwd') {
    pushLines(lines, emitPrepareOwnedValueWrite(out))
    lines.push(emitStatusCheck(`ccjs_process_cwd(&ccjs_default_allocator, &${out})`, context))
  } else if (property === 'argv') {
    const index = dependencies.emitPreparedNumberExpression(expression.index, context)

    pushLines(lines, index.lines)
    pushLines(lines, emitPrepareOwnedValueWrite(out))
    lines.push(
      emitStatusCheck(`ccjs_process_argv(&ccjs_default_allocator, (int)(${index.expression}), &${out})`, context)
    )
  } else if (stringProperty != null) {
    const functionName = cProcessRuntimeStringFunctionName(stringProperty)

    if (functionName == null) {
      return null
    }

    pushLines(lines, emitPrepareOwnedValueWrite(out))
    lines.push(emitStatusCheck(`ccjs_process_${functionName}(&ccjs_default_allocator, &${out})`, context))
  } else {
    let name = ''

    if (envName != null) {
      name = envName
    }

    pushLines(lines, emitPrepareOwnedValueWrite(out))
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
  context: ProcessCContext,
  dependencies: ProcessLoweringDependencies
): string[] | null {
  if (cProcessRuntimeMethodName(expression) !== 'exit') {
    return null
  }

  let code: PreparedExpression = {
    lines: [],
    expression: '0'
  }

  if (expression.args[0] != null) {
    code = dependencies.emitPreparedNumberExpression(expression.args[0], context)
  }

  const lines: string[] = []
  pushLines(lines, code.lines)
  lines.push(`ccjs_process_exit((int)(${code.expression}));`)

  return lines
}

export function emitProcessExitCodeAssignment(
  expression: AnyNode,
  context: ProcessCContext,
  dependencies: ProcessLoweringDependencies
): string[] | null {
  if (expression.type !== 'AssignmentExpression' || cProcessRuntimePropertyName(expression) !== 'exitCode') {
    return null
  }

  const value = dependencies.emitPreparedNumberExpression(expression.value, context)
  const lines: string[] = []

  pushLines(lines, value.lines)
  lines.push(`ccjs_process_set_exit_code((int)(${value.expression}));`)

  return lines
}

function pushLines(target: string[], source: string[]): void {
  for (const line of source) {
    target.push(line)
  }
}
