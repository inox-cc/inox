import { osRuntimeConstantValue } from '../../stdlib/descriptors/os.ts'
import type { AnyNode } from '../../types.ts'
import {
  emitPrepareOwnedValueWrite,
  emitStatusCheck,
  nextCName,
  registerOwnedValue
} from '../context.ts'
import type { CFunctionContext } from '../context.ts'
import { cStringLiteral, utf8ByteLength } from '../identifiers.ts'
import type { CPreparedExpression as PreparedExpression } from '../types.ts'

export function cOsRuntimeMethodName(expression: AnyNode): string | null {
  if (expression.type !== 'CallExpression') {
    return null
  }

  const method = expression.osRuntimeMethod

  if (method != null) {
    return method
  }

  return null
}

export function cOsRuntimeConstantName(expression: AnyNode): string | null {
  const constant = expression.osRuntimeConstant

  if (constant != null) {
    return constant
  }

  return null
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
  let value: string | null = null

  if (constant != null) {
    value = cOsRuntimeConstantValue(constant)
  }

  if (value == null) {
    return null
  }

  const out = nextCName(context, 'ccjs_os_constant')
  registerOwnedValue(context, out)

  const lines = emitPrepareOwnedValueWrite(out)
  lines.push(
    emitStatusCheck(
      `ccjs_string_from_literal(&ccjs_default_allocator, ${cStringLiteral(value)}, ${utf8ByteLength(value)}, &${out})`,
      context
    )
  )

  return {
    lines,
    expression: out
  }
}

export function emitPreparedOsStringCallExpression(
  expression: AnyNode,
  context: CFunctionContext
): PreparedExpression | null {
  const method = cOsRuntimeMethodName(expression)

  if (method == null) {
    return null
  }

  const out = nextCName(context, 'ccjs_os_value')
  const lines = emitPrepareOwnedValueWrite(out)
  registerOwnedValue(context, out)

  lines.push(emitStatusCheck(`ccjs_os_${method}(&ccjs_default_allocator, &${out})`, context))

  return {
    lines,
    expression: out
  }
}
