// @targets cc
// @expect pass
// @stdout setTimeout

type ReferenceShape = {
  path: string[]
}

function clonePath(source: string[]): string[] {
  const result: string[] = []

  for (let index = 0; index < source.length; index = index + 1) {
    result.push(source[index])
  }

  return result
}

function cloneReference(source: ReferenceShape): ReferenceShape {
  const path = clonePath(source.path)
  const target: ReferenceShape = {
    path: path
  }

  return target
}

const reference = cloneReference({ path: ['setTimeout'] })

console.log(reference.path[0])
