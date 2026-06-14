import type { AnyNode } from './types.ts'

export function memberExpressionPath(expression: AnyNode): string[] | null {
  if (expression?.type === 'Reference' && expression.path.length > 0) {
    return expression.path
  }

  if (expression?.type !== 'MemberExpression') {
    return null
  }

  const objectPath = memberExpressionPath(expression.object)

  return objectPath == null ? null : [...objectPath, expression.property]
}
