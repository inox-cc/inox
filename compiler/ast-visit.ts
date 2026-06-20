export type AstLikeObject = {
  [key: string]: unknown
  loc?: unknown
  parent?: unknown
  shape?: unknown
  body?: unknown
  params?: unknown
  fields?: unknown
  methods?: unknown
  init?: unknown
  condition?: unknown
  consequent?: unknown
  alternate?: unknown
  test?: unknown
  update?: unknown
  iterable?: unknown
  discriminant?: unknown
  cases?: unknown
  block?: unknown
  handler?: unknown
  finalizer?: unknown
  argument?: unknown
  args?: unknown
  callee?: unknown
  object?: unknown
  index?: unknown
  target?: unknown
  value?: unknown
  valueType?: unknown
  functionType?: unknown
  returnShape?: unknown
  left?: unknown
  right?: unknown
  elements?: unknown
  properties?: unknown
  expression?: unknown
  child?: unknown
  siblings?: unknown
}

export type AstLikeVisitor = (node: AstLikeObject) => void

export type VisitAstLikeOptions = {
  skipKeys?: Set<string>
}

const defaultSkipKeys = new Set(['loc', 'parent', 'shape'])

export function visitAstLike(node: unknown, visitor: AstLikeVisitor, options: VisitAstLikeOptions = {}): void {
  let skipKeys = defaultSkipKeys

  if (options.skipKeys !== null && typeof options.skipKeys !== 'undefined') {
    skipKeys = options.skipKeys
  }

  visitAstLikeNode(node, visitor, skipKeys)
}

function visitAstLikeNode(node: unknown, visitor: AstLikeVisitor, skipKeys: Set<string>): void {
  if (node === null || typeof node === 'undefined') {
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

  visitAstLikeChild('loc', item.loc, visitor, skipKeys)
  visitAstLikeChild('parent', item.parent, visitor, skipKeys)
  visitAstLikeChild('shape', item.shape, visitor, skipKeys)
  visitAstLikeChild('body', item.body, visitor, skipKeys)
  visitAstLikeChild('params', item.params, visitor, skipKeys)
  visitAstLikeChild('fields', item.fields, visitor, skipKeys)
  visitAstLikeChild('methods', item.methods, visitor, skipKeys)
  visitAstLikeChild('init', item.init, visitor, skipKeys)
  visitAstLikeChild('condition', item.condition, visitor, skipKeys)
  visitAstLikeChild('consequent', item.consequent, visitor, skipKeys)
  visitAstLikeChild('alternate', item.alternate, visitor, skipKeys)
  visitAstLikeChild('test', item.test, visitor, skipKeys)
  visitAstLikeChild('update', item.update, visitor, skipKeys)
  visitAstLikeChild('iterable', item.iterable, visitor, skipKeys)
  visitAstLikeChild('discriminant', item.discriminant, visitor, skipKeys)
  visitAstLikeChild('cases', item.cases, visitor, skipKeys)
  visitAstLikeChild('block', item.block, visitor, skipKeys)
  visitAstLikeChild('handler', item.handler, visitor, skipKeys)
  visitAstLikeChild('finalizer', item.finalizer, visitor, skipKeys)
  visitAstLikeChild('argument', item.argument, visitor, skipKeys)
  visitAstLikeChild('args', item.args, visitor, skipKeys)
  visitAstLikeChild('callee', item.callee, visitor, skipKeys)
  visitAstLikeChild('object', item.object, visitor, skipKeys)
  visitAstLikeChild('index', item.index, visitor, skipKeys)
  visitAstLikeChild('target', item.target, visitor, skipKeys)
  visitAstLikeChild('value', item.value, visitor, skipKeys)
  visitAstLikeChild('valueType', item.valueType, visitor, skipKeys)
  visitAstLikeChild('functionType', item.functionType, visitor, skipKeys)
  visitAstLikeChild('returnShape', item.returnShape, visitor, skipKeys)
  visitAstLikeChild('left', item.left, visitor, skipKeys)
  visitAstLikeChild('right', item.right, visitor, skipKeys)
  visitAstLikeChild('elements', item.elements, visitor, skipKeys)
  visitAstLikeChild('properties', item.properties, visitor, skipKeys)
  visitAstLikeChild('expression', item.expression, visitor, skipKeys)
  visitAstLikeChild('child', item.child, visitor, skipKeys)
  visitAstLikeChild('siblings', item.siblings, visitor, skipKeys)
}

function visitAstLikeChild(key: string, value: unknown, visitor: AstLikeVisitor, skipKeys: Set<string>): void {
  if (skipKeys.has(key)) {
    return
  }

  if (value !== null && typeof value !== 'undefined') {
    visitAstLikeNode(value, visitor, skipKeys)
  }
}
