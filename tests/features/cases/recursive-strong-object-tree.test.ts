// @targets cc
// @expect pass
// @stdout root:2:leaf

type TreeNode = {
  name: string
  children: TreeNode[]
}

const tree: TreeNode = {
  name: 'root',
  children: [
    { name: 'left', children: [] },
    { name: 'leaf', children: [] }
  ]
}

console.log(`${tree.name}:${tree.children.length}:${tree.children[1]?.name ?? 'missing'}`)
