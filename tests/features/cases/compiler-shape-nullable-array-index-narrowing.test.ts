// @targets cc
// @expect pass
// @stdout ready

function read(values: Array<string | null>): string {
  if (values[0] === null || typeof values[0] === 'undefined') {
    return 'missing'
  }

  return values[0]
}

console.log(read(['ready']))
