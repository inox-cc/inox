// @targets cc
// @expect pass
// @stdout emit:E

function methodName(source: string): string {
  const first = source[0].toUpperCase()
  return `${source}:${first}`
}

console.log(methodName('emit'))
