export function usesCJsGlobal(expression: any, context: any): boolean {
  const root = rootReferenceName(expression)

  return root != null && isCJsGlobalRoot(root, context)
}

export function isCJsGlobalRoot(name: string, context: any): boolean {
  return context.jsGlobalRoots.has(name)
}

export function rootReferenceName(expression: any): string | null {
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
