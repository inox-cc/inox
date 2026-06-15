import { osRuntimeConstantValue } from '../../stdlib/descriptors/os.ts'
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

export function cOsRuntimeMethodName(expression: AnyNode): string | null {
  if (expression?.type !== 'CallExpression' || typeof expression.osRuntimeMethod !== 'string') {
    return null
  }

  return expression.osRuntimeMethod
}

export function cOsRuntimeConstantName(expression: AnyNode): string | null {
  if (typeof expression?.osRuntimeConstant !== 'string') {
    return null
  }

  return expression.osRuntimeConstant
}

export function cOsRuntimeConstantValue(name: string): string | null {
  if (name !== 'EOL') {
    return null
  }

  return osRuntimeConstantValue(name)
}

export function emitPreparedOsConstantExpression(
  expression: AnyNode,
  context: CFunctionContext
): PreparedExpression | null {
  const constant = cOsRuntimeConstantName(expression)
  const value = constant == null ? null : cOsRuntimeConstantValue(constant)

  if (value == null) {
    return null
  }

  const out = nextCName(context, 'ccjs_os_constant')
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

export function emitPreparedOsStringCallExpression(
  expression: AnyNode,
  context: CFunctionContext,
  options: PreparedCallOptions = {}
): PreparedExpression | null {
  const method = cOsRuntimeMethodName(expression)

  if (method == null) {
    return null
  }

  const out = options.out ?? nextCName(context, 'ccjs_os_value')
  const lines = emitPrepareOwnedValueWrite(out)

  if (options.owned !== false) {
    registerOwnedValue(context, out)
  }

  lines.push(emitStatusCheck(`ccjs_os_${method}(&ccjs_default_allocator, &${out})`, context))

  return {
    lines,
    expression: out
  }
}
