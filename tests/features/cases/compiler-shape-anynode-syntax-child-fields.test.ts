// @targets cc
// @expect pass
// @stdout ok

type AnyNode = { [key: string]: any }

function markChild(node: AnyNode | null | undefined): number {
  if (node === null || typeof node === 'undefined') {
    return 0
  }

  node.templatePlaceholder = true
  return 1
}

function markSyntaxChildren(node: AnyNode): number {
  node.templatePlaceholder = true

  return markChild(node.test) + markChild(node.consequent) + markChild(node.alternate)
}

markSyntaxChildren({})
console.log('ok')
