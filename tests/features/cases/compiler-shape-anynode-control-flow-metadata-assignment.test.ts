// @targets cc
// @expect pass
// @stdout ok

type AnyNode = { [key: string]: any }

function attachControlFlowMetadata(node: AnyNode): void {
  node.update = { type: 'UpdateExpression' }
  node.iterable = { type: 'Reference', path: ['items'] }
  node.discriminant = { type: 'Reference', path: ['kind'] }
}

const node: AnyNode = {
  type: 'ForStatement'
}

attachControlFlowMetadata(node)

if (
  node.update.type === 'UpdateExpression' &&
  node.iterable.type === 'Reference' &&
  node.discriminant.type === 'Reference'
) {
  console.log('ok')
}
