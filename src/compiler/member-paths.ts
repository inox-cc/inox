import type { AnyNode } from './types.ts'

type MemberPathNode = AnyNode & {
  object?: AnyNode | null
  path?: string[]
  property?: string
}

export function memberExpressionPath(expression: MemberPathNode | null | undefined): string[] {
  if (expression == null) {
    return []
  }

  if (expression.type === 'Reference') {
    const path = expression.path

    if (path != null && path.length > 0) {
      return path
    }
  }

  if (expression.type === 'MemberExpression') {
    const objectPath = memberExpressionPath(expression.object)
    const property = expression.property

    if (property != null && objectPath.length > 0) {
      const path: string[] = []

      for (const part of objectPath) {
        path.push(part)
      }

      path.push(property)
      return path
    }
  }

  return []
}
