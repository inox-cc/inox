import { osRuntimeConstantValue } from './descriptor.ts'
import type { AnyNode } from '../../../../compiler/types.ts'
import { emitPrepareOwnedValueWrite, emitStatusCheck, nextCName, registerOwnedValue } from '../../../../compiler/c/context.ts'
import { cStringLiteral, utf8ByteLength } from '../../../../compiler/c/identifiers.ts'
import type { CPreparedExpression as PreparedExpression } from '../../../../compiler/c/types.ts'

type OsCContext = {
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

export function cOsRuntimeMethodName(expression: AnyNode | null | undefined): string | null {
  if (expression === null || typeof expression === 'undefined' || expression.type !== 'CallExpression') {
    return null
  }

  if (expression.osRuntimeMethod !== null && typeof expression.osRuntimeMethod !== 'undefined') {
    return expression.osRuntimeMethod
  }

  return null
}

export function cOsRuntimeConstantName(expression: AnyNode | null | undefined): string | null {
  if (expression === null || typeof expression === 'undefined') {
    return null
  }

  if (expression.osRuntimeConstant !== null && typeof expression.osRuntimeConstant !== 'undefined') {
    return expression.osRuntimeConstant
  }

  return null
}

export function cOsRuntimeConstantValue(name: string): string | null {
  if (name !== 'EOL') {
    return null
  }

  return osRuntimeConstantValue(name)
}

export function emitPreparedOsConstantExpression(expression: AnyNode, context: OsCContext): PreparedExpression | null {
  const constant = cOsRuntimeConstantName(expression)
  let value: string | null = null

  if (constant !== null && typeof constant !== 'undefined') {
    value = cOsRuntimeConstantValue(constant)
  }

  if (value === null || typeof value === 'undefined') {
    return null
  }

  const out = nextCName(context, 'inox_os_constant')
  registerOwnedValue(context, out)

  const lines = emitPrepareOwnedValueWrite(out)
  lines.push(
    emitStatusCheck(
      `inox_string_from_literal(&inox_default_allocator, ${cStringLiteral(value)}, ${utf8ByteLength(value)}, &${out})`,
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
  context: OsCContext
): PreparedExpression | null {
  const method = cOsRuntimeMethodName(expression)

  if (method === null || typeof method === 'undefined') {
    return null
  }

  const out = nextCName(context, 'inox_os_value')
  const lines = emitPrepareOwnedValueWrite(out)
  registerOwnedValue(context, out)

  lines.push(emitStatusCheck(`inox_os_${method}(&inox_default_allocator, &${out})`, context))

  return {
    lines,
    expression: out
  }
}
