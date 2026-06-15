import { pathRuntimeConstantValue } from '../../stdlib/descriptors/path.ts'

export function cPathRuntimeMethodName(expression: any): string | null {
  if (expression?.type !== 'CallExpression' || typeof expression.pathRuntimeMethod !== 'string') {
    return null
  }

  return expression.pathRuntimeMethod
}

export function cPathRuntimeConstantName(expression: any): string | null {
  if (typeof expression?.pathRuntimeConstant !== 'string') {
    return null
  }

  return expression.pathRuntimeConstant
}

export function cPathRuntimeConstantValue(name: string): string | null {
  if (name !== 'delimiter' && name !== 'sep') {
    return null
  }

  return pathRuntimeConstantValue(name)
}
