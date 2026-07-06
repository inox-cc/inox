import { osRuntimeConstantValue } from './descriptor.ts'
import type { AnyNode } from '../../../../compiler/types.ts'
import type { CPreparedExpression as PreparedExpression } from '../../../../compiler/c/types.ts'

type OsCContext = {}

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

  return {
    lines: [],
    expression: 'os.EOL',
    cppType: 'inox::String',
    owned: false
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

  return {
    lines: [],
    expression: `os.${method}()`,
    cppType: 'inox::String',
    owned: false
  }
}
