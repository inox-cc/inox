import { osRuntimeConstantValue } from '../../stdlib/descriptors/os.ts'

export function cOsRuntimeMethodName(expression: any): string | null {
  if (expression?.type !== 'CallExpression' || typeof expression.osRuntimeMethod !== 'string') {
    return null
  }

  return expression.osRuntimeMethod
}

export function cOsRuntimeConstantName(expression: any): string | null {
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
