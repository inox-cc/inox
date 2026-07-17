// @targets cc
// @expect pass
// @stdout 1

function size(values: string[], limit: number = values.length): number {
  return limit
}

console.log(size(['value']))
