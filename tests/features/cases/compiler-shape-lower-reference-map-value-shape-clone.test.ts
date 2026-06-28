// @targets cc
// @expect pass
// @stdout setTimeout
// @stdout 1

function cloneReferencePath(source: string[]): string[] {
  const result: string[] = []

  for (let index = 0; index < source.length; index = index + 1) {
    result.push(source[index])
  }

  return result
}

const sourcePath = ['setTimeout']
const clonedPath = cloneReferencePath(sourcePath)

sourcePath.push('changed')

console.log(clonedPath[0])
console.log(clonedPath.length)
