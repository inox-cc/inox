// @targets cc
// @expect pass
// @stdout 1

type CompilerNode = {
  [key: string]: any
}

type ClassExpressionNode = CompilerNode

function methodCount(classes: CompilerNode[]): number {
  const classNodes: ClassExpressionNode[] = classes
  let count = 0

  for (const item of classNodes) {
    const methods: ClassExpressionNode[] = item.methods
    count = count + methods.length
  }

  return count
}

console.log(methodCount([{ methods: [{}] }]))
