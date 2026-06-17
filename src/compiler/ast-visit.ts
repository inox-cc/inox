export type AstLikeObject = Record<string, unknown>

export type AstLikeVisitor = (node: AstLikeObject) => void

export type VisitAstLikeOptions = {
  skipKeys?: Iterable<string>
}

const defaultSkipKeys = new Set(['loc', 'parent', 'shape'])
const astLikeChildKeys = [
  'loc',
  'parent',
  'shape',
  'body',
  'params',
  'fields',
  'methods',
  'init',
  'condition',
  'consequent',
  'alternate',
  'test',
  'update',
  'iterable',
  'discriminant',
  'cases',
  'block',
  'handler',
  'finalizer',
  'argument',
  'args',
  'callee',
  'object',
  'index',
  'target',
  'value',
  'valueType',
  'functionType',
  'returnShape',
  'left',
  'right',
  'elements',
  'properties',
  'expression',
  'child',
  'siblings'
]

export function visitAstLike(node: unknown, visitor: AstLikeVisitor, options: VisitAstLikeOptions = {}): void {
  const skipKeys = options.skipKeys == null ? defaultSkipKeys : new Set(options.skipKeys)

  visitAstLikeNode(node, visitor, skipKeys)
}

function visitAstLikeNode(node: unknown, visitor: AstLikeVisitor, skipKeys: Set<string>): void {
  if (node == null) {
    return
  }

  if (Array.isArray(node)) {
    for (let index = 0; index < node.length; index = index + 1) {
      const item = node[index]
      visitAstLikeNode(item, visitor, skipKeys)
    }
    return
  }

  if (typeof node !== 'object') {
    return
  }

  const item = node as AstLikeObject

  visitor(item)

  for (let index = 0; index < astLikeChildKeys.length; index = index + 1) {
    const key = astLikeChildKeys[index]

    if (skipKeys.has(key)) {
      continue
    }

    const value = item[key]

    if (value != null) {
      visitAstLikeNode(value, visitor, skipKeys)
    }
  }
}
