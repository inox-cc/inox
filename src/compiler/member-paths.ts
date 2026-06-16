import type { AnyNode } from './types.ts'

export function memberExpressionPath(expression: AnyNode | null): string[] | null {
  if (expression != null) {
    if (expression.type === 'Reference' && expression.path.length > 0) {
      return expression.path
    }

    if (expression.type === 'MemberExpression') {
      const objectPath = memberExpressionPath(expression.object)

      if (objectPath != null) {
        const path: string[] = []

        for (const part of objectPath) {
          path.push(part)
        }

        path.push(expression.property)
        return path
      }
    }
  }

  return null
}
