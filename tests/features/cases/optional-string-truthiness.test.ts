// @targets cc
// @expect pass
// @stdout yes no

type Options = {
  readonly value?: string
}

function label(options: Options): string {
  return options.value ? 'yes' : 'no'
}

console.log(label({ value: 'present' }), label({}))
