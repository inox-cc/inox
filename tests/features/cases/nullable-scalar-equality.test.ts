// @targets cc
// @expect pass
// @stdout 1

type Options = {
  enabled?: boolean
  count?: number
}

function differs(left: Options, right: Options): boolean {
  return left.enabled === right.enabled && left.count !== right.count
}

console.log(differs({}, { count: 1 }))
