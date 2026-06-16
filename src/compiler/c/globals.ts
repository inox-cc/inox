import type { AnyNode } from '../types.ts'

type CJsGlobalContext = {
  jsGlobalRoots: Set<string>
}

export function usesCJsGlobal(expression: AnyNode, context: CJsGlobalContext): boolean {
  const root = rootReferenceName(expression)

  return root != null && isCJsGlobalRoot(root, context)
}

export function isCJsGlobalRoot(name: string, context: CJsGlobalContext): boolean {
  return context.jsGlobalRoots.has(name)
}

export function rootReferenceName(expression: AnyNode | null | undefined): string | null {
  if (expression == null) {
    return null
  }

  if (expression.type === 'Reference') {
    return expression.path[0]
  }

  if (expression.type === 'MemberExpression' || expression.type === 'OptionalMemberExpression') {
    return rootReferenceName(expression.object)
  }

  if (expression.type === 'IndexExpression' || expression.type === 'OptionalIndexExpression') {
    return rootReferenceName(expression.object)
  }

  return null
}
