// @targets cc
// @expect pass
// @stdout none
// @stdout value

type Options = {
  value?: string
}

function read(options: Options = {}): string {
  return options.value ?? 'none'
}

function forward(options?: Options): string {
  return read(options)
}

console.log(forward())
console.log(forward({ value: 'value' }))
