import type { AnyNode } from '../types.ts'

export type CallLikeIrNode = AnyNode & {
  type?: string | null
}

export function hasStringValue(value: string | null | undefined): boolean {
  return value !== null && typeof value !== 'undefined'
}

export function isCallLikeNode(node: CallLikeIrNode): boolean {
  return node.type === 'CallExpression' || node.type === 'OptionalCallExpression' || node.type === 'NewExpression'
}

export function nullableString(value: string | null | undefined): string | null {
  if (value === null || typeof value === 'undefined') {
    return null
  }

  return value
}

export function simpleReferencePath(expression: AnyNode | null | undefined): string[] | null {
  if (expression === null || typeof expression === 'undefined' || expression.type !== 'Reference') {
    return null
  }

  const path = expression.path

  if (path === null || typeof path === 'undefined' || path.length !== 1) {
    return null
  }

  return path
}
