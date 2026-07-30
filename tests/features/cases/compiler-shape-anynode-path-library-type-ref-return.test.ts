// @targets cc
// @expect pass
// @stdout root

function firstPathPart(path: string[]): string {
  if (path.length > 0) {
    return path[0]
  }

  return ''
}

function printCheckedPath(expression: AnyNode): void {
  const path = expression.path

  if (path === null || typeof path === 'undefined') {
    return
  }

  console.log(firstPathPart(path))
}

printCheckedPath({ path: ['root'] })
