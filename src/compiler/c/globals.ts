import type { CEmitContext } from './context.ts'
import type { AnyNode } from '../types.ts'

export function usesCJsGlobal(expression: AnyNode, context: CEmitContext): boolean {
  const root = rootReferenceName(expression)

  return root != null && isCJsGlobalRoot(root, context)
}

export function isCJsGlobalRoot(name: string, context: CEmitContext): boolean {
  return context.jsGlobalRoots.has(name)
}

export function rootReferenceName(expression: AnyNode): string | null {
  if (expression?.type === 'Reference') {
    return expression.path[0]
  }

  if (expression?.type === 'MemberExpression' || expression?.type === 'OptionalMemberExpression') {
    return rootReferenceName(expression.object)
  }

  if (expression?.type === 'IndexExpression' || expression?.type === 'OptionalIndexExpression') {
    return rootReferenceName(expression.object)
  }

  return null
}
