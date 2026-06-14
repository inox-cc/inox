export type AstLikeObject = Record<string, unknown>

export type AstLikeVisitor = (node: AstLikeObject) => void

export type VisitAstLikeOptions = {
  skipKeys?: Iterable<string>
}

const defaultSkipKeys = new Set(['loc', 'parent', 'shape'])

export function visitAstLike(node: unknown, visitor: AstLikeVisitor, options: VisitAstLikeOptions = {}): void {
  const skipKeys = options.skipKeys == null ? defaultSkipKeys : new Set(options.skipKeys)

  visitAstLikeNode(node, visitor, skipKeys)
}

function visitAstLikeNode(node: unknown, visitor: AstLikeVisitor, skipKeys: Set<string>): void {
  if (node == null) {
    return
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      visitAstLikeNode(item, visitor, skipKeys)
    }
    return
  }

  if (typeof node !== 'object') {
    return
  }

  const item = node as AstLikeObject

  visitor(item)

  for (const [key, value] of Object.entries(item)) {
    if (skipKeys.has(key)) {
      continue
    }

    visitAstLikeNode(value, visitor, skipKeys)
  }
}
