// @targets cc
// @expect pass
// @stdout 1 0

type Flags = {
  readonly enabled?: boolean
}

function enabled(primary: Flags | null, fallback: Flags): boolean {
  return (primary?.enabled ?? fallback.enabled) === true
}

console.log(enabled(null, { enabled: true }), enabled({}, {}))
