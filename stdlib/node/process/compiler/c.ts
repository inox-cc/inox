import {
  isProcessRuntimeNumberProperty,
  isProcessRuntimeStringProperty,
  nodeProcessImportSource,
  processRuntimePropertyValueType
} from './descriptor.ts'
import type { AnyNode } from '../../../../compiler/types.ts'
import { emitPrepareOwnedValueWrite, emitStatusCheck, nextCName, registerOwnedValue } from '../../../../compiler/c/context.ts'
import { cStringLiteral, utf8ByteLength } from '../../../../compiler/c/identifiers.ts'
import type {
  CObjectShape,
  CObjectShapeField,
  CPreparedCallOptions as PreparedCallOptions,
  CPreparedExpression as PreparedExpression
} from '../../../../compiler/c/types.ts'

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
  objectShapes: Map<string, CObjectShapeField[]>
  variables: Map<string, string>
}

export type ProcessLoweringDependencies = {
  emitCValueExpression(expression: AnyNode, context: ProcessCContext): PreparedExpression
  emitPreparedNumberExpression(expression: AnyNode, context: ProcessCContext): PreparedExpression
  registerObjectShape(context: ProcessCContext, name: string, shape: CObjectShape | null | undefined): void
}

export type ProcessRuntimeObjectReferenceEmitterDescriptor = {
  source: string
  name: string
}

export const processRuntimeObjectReferenceEmitterDescriptors: ProcessRuntimeObjectReferenceEmitterDescriptor[] = [
  {
    source: nodeProcessImportSource,
    name: 'process'
  }
]

export function cProcessRuntimeMethodName(expression: AnyNode | null | undefined): string | null {
  if (expression === null || typeof expression === 'undefined' || expression.type !== 'CallExpression') {
    return null
  }

  const method = expression.processRuntimeMethod

  if (method !== null && typeof method !== 'undefined') {
    return method
  }

  return null
}

export function cProcessRuntimePropertyName(expression: AnyNode | null | undefined): string | null {
  if (expression === null || typeof expression === 'undefined') {
    return null
  }

  const property = expression.processRuntimeProperty

  if (property !== null && typeof property !== 'undefined') {
    return property
  }

  return null
}

export function cProcessRuntimeObjectName(expression: AnyNode | null | undefined): string | null {
  if (expression === null || typeof expression === 'undefined') {
    return null
  }

  if (expression.runtimeObjectSource !== nodeProcessImportSource) {
    return null
  }

  const object = expression.runtimeObjectName

  if (object !== null && typeof object !== 'undefined') {
    return object
  }

  return null
}

export function cProcessRuntimePropertyValueType(expression: AnyNode | null | undefined): string | null {
  const property = cProcessRuntimePropertyName(expression)

  if (property !== null && typeof property !== 'undefined') {
    return processRuntimePropertyValueType(property)
  }

  return null
}

export function emitPreparedProcessRuntimeObjectReferenceExpression(
  expression: AnyNode,
  context: ProcessCContext,
  dependencies: ProcessLoweringDependencies
): PreparedExpression | null {
  if (cProcessRuntimeObjectName(expression) !== 'process') {
    return null
  }

  return emitPreparedProcessValueExpression(expression, context, dependencies, null)
}

export function cProcessRuntimeStringPropertyName(expression: AnyNode | null | undefined): string | null {
  const property = cProcessRuntimePropertyName(expression)

  if (property !== null && typeof property !== 'undefined' && isProcessRuntimeStringProperty(property)) {
    return property
  }

  return null
}

export function cProcessRuntimeNumberPropertyName(expression: AnyNode | null | undefined): string | null {
  const property = cProcessRuntimePropertyName(expression)

  if (property !== null && typeof property !== 'undefined' && isProcessRuntimeNumberProperty(property)) {
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
  if (expression === null || typeof expression === 'undefined') {
    return null
  }

  const name = expression.processRuntimeEnvName

  if (name !== null && typeof name !== 'undefined') {
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
    (stringProperty === null || typeof stringProperty === 'undefined') &&
    (envName === null || typeof envName === 'undefined')
  ) {
    return null
  }

  let out = nextCName(context, 'inox_process_string')
  const lines: string[] = []

  if (
    options !== null &&
    typeof options !== 'undefined' &&
    options.out !== null &&
    typeof options.out !== 'undefined'
  ) {
    out = options.out
  }

  if (options === null || typeof options === 'undefined' || options.owned !== false) {
    registerOwnedValue(context, out)
  }

  if (method === 'cwd') {
    pushLines(lines, emitPrepareOwnedValueWrite(out))
    lines.push(emitStatusCheck(`inox_process_cwd(&inox_default_allocator, &${out})`, context))
  } else if (property === 'argv') {
    const index = dependencies.emitPreparedNumberExpression(expression.index, context)

    pushLines(lines, index.lines)
    pushLines(lines, emitPrepareOwnedValueWrite(out))
    lines.push(
      emitStatusCheck(`inox_process_argv(&inox_default_allocator, (int)(${index.expression}), &${out})`, context)
    )
  } else if (stringProperty !== null && typeof stringProperty !== 'undefined') {
    const functionName = cProcessRuntimeStringFunctionName(stringProperty)

    if (functionName === null || typeof functionName === 'undefined') {
      return null
    }

    pushLines(lines, emitPrepareOwnedValueWrite(out))
    const callName = functionName === 'process' ? 'inox_process' : `inox_process_${functionName}`

    lines.push(emitStatusCheck(`${callName}(&inox_default_allocator, &${out})`, context))
  } else {
    let name = ''

    if (envName !== null && typeof envName !== 'undefined') {
      name = envName
    }

    pushLines(lines, emitPrepareOwnedValueWrite(out))
    lines.push(
      emitStatusCheck(
        `inox_process_env(&inox_default_allocator, ${cStringLiteral(name)}, ${utf8ByteLength(name)}, &${out})`,
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

  if (property === null || typeof property === 'undefined') {
    return null
  }

  if (property === 'argv.length') {
    return {
      lines: [],
      expression: 'inox_process_argv_length()'
    }
  }

  if (property === 'pid') {
    return {
      lines: [],
      expression: 'inox_process_pid()'
    }
  }

  return {
    lines: [],
    expression: 'inox_process_get_exit_code()'
  }
}

export function emitPreparedProcessValueExpression(
  expression: AnyNode,
  context: ProcessCContext,
  dependencies: ProcessLoweringDependencies,
  options: PreparedCallOptions | null | undefined
): PreparedExpression | null {
  const method = cProcessRuntimeMethodName(expression)
  const object = cProcessRuntimeObjectName(expression)
  const property = cProcessRuntimePropertyName(expression)

  if (method !== 'hrtime' && method !== 'memoryUsage' && object !== 'process' && property !== 'versions') {
    return null
  }

  let out = nextCName(context, 'inox_process_value')
  const lines: string[] = []

  if (
    options !== null &&
    typeof options !== 'undefined' &&
    options.out !== null &&
    typeof options.out !== 'undefined'
  ) {
    out = options.out
  }

  if (options === null || typeof options === 'undefined' || options.owned !== false) {
    registerOwnedValue(context, out)
  }

  pushLines(lines, emitPrepareOwnedValueWrite(out))

  if (method === 'memoryUsage' || object === 'process' || property === 'versions') {
    let functionName = 'process'

    if (method === 'memoryUsage') {
      functionName = 'memoryUsage'
    } else if (property === 'versions') {
      functionName = 'versions'
    }

    context.variables.set(out, 'object')
    dependencies.registerObjectShape(context, out, expression.shape)

    const callName = functionName === 'process' ? 'inox_process' : `inox_process_${functionName}`

    lines.push(emitStatusCheck(`${callName}(&inox_default_allocator, &${out})`, context))

    return {
      lines,
      expression: out
    }
  }

  let previous: PreparedExpression = {
    lines: [],
    expression: 'inox_undefined_value()'
  }
  let hasPrevious = '0'

  if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
    previous = dependencies.emitCValueExpression(expression.args[0], context)
    hasPrevious = '1'
  }

  pushLines(lines, previous.lines)
  lines.push(
    emitStatusCheck(
      `inox_process_hrtime(&inox_default_allocator, ${previous.expression}, ${hasPrevious}, &${out})`,
      context
    )
  )

  return {
    lines,
    expression: out
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

  if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
    code = dependencies.emitPreparedNumberExpression(expression.args[0], context)
  }

  const lines: string[] = []
  pushLines(lines, code.lines)
  lines.push(`inox_process_exit((int)(${code.expression}));`)

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
  lines.push(`inox_process_set_exit_code((int)(${value.expression}));`)

  return lines
}

function pushLines(target: string[], source: string[]): void {
  for (const line of source) {
    target.push(line)
  }
}
