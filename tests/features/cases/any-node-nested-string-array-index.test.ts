// @targets cc
// @expect pass
// @stdout root

type CompilerNode = {
  [key: string]: any
}

function argumentPath(node: CompilerNode, argumentIndex: number): string | null {
  if (argumentIndex < 0 || argumentIndex >= node.args.length) {
    return null
  }

  const argument = node.args[argumentIndex]

  if (argument.type !== 'Reference' || argument.path.length !== 1) {
    return null
  }

  return argument.path[0]
}

console.log(argumentPath({ args: [{ type: 'Reference', path: ['root'] }] }, 0))
