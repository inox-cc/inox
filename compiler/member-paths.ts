import type { AnyNode } from './types.ts'

type MemberPathNode = AnyNode & {
  index?: AnyNode | null
  object?: AnyNode | null
  path?: string[]
  property?: string | null
  value?: string | null
}

export function memberExpressionPath(expression: MemberPathNode | null | undefined): string[] {
  if (expression === null || typeof expression === 'undefined') {
    return []
  }

  if (expression.type === 'Reference') {
    const path = expression.path

    if (path !== null && typeof path !== 'undefined' && path.length > 0) {
      return path
    }
  }

  if (expression.type === 'MemberExpression' || expression.type === 'OptionalMemberExpression') {
    const objectPath = memberExpressionPath(expression.object)
    const property = expression.property

    if (property !== null && typeof property !== 'undefined' && objectPath.length > 0) {
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

export function expressionNarrowingPath(expression: MemberPathNode | null | undefined): string | null {
  if (expression === null || typeof expression === 'undefined') {
    return null
  }

  if (expression.type === 'Reference') {
    const path = expression.path

    if (path !== null && typeof path !== 'undefined' && path.length > 0) {
      return path.join('.')
    }

    return null
  }

  if (expression.type === 'MemberExpression' || expression.type === 'OptionalMemberExpression') {
    const objectPath = expressionNarrowingPath(expression.object)
    const property = expression.property

    if (objectPath !== null && property !== null && typeof property !== 'undefined') {
      return `${objectPath}.${property}`
    }

    return null
  }

  if (expression.type === 'IndexExpression' || expression.type === 'OptionalIndexExpression') {
    const objectPath = expressionNarrowingPath(expression.object)
    const index = expression.index

    if (objectPath === null || index === null || typeof index === 'undefined') {
      return null
    }

    if (index.type === 'NumberLiteral' && typeof index.value === 'string') {
      return `${objectPath}[${index.value}]`
    }

    if (index.type === 'StringLiteral' && typeof index.value === 'string') {
      return `${objectPath}[${JSON.stringify(index.value)}]`
    }
  }

  return null
}

export function narrowingPathRoot(path: string): string {
  let end = path.length
  const memberIndex = path.indexOf('.')
  const elementIndex = path.indexOf('[')

  if (memberIndex >= 0 && memberIndex < end) {
    end = memberIndex
  }

  if (elementIndex >= 0 && elementIndex < end) {
    end = elementIndex
  }

  return path.slice(0, end)
}

export function narrowingPathIsSameOrDescendant(path: string, parent: string): boolean {
  if (path === parent) {
    return true
  }

  if (!path.startsWith(parent)) {
    return false
  }

  const boundary = path[parent.length]
  return boundary === '.' || boundary === '['
}
