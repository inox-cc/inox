// @targets cc
// @expect pass
// @stdout none

type Options = {
  value?: string
}

function describe(value?: string): string {
  return value ?? 'none'
}

const options: Options = {}

console.log(describe(options.value))
