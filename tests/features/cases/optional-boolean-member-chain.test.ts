// @targets cc
// @expect pass
// @stdout 0

type Options = {
  enabled?: boolean
}

function enabled(options: Options | null): boolean {
  return options?.enabled === true
}

console.log(enabled(null))
