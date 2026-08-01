// @targets cc
// @expect pass
// @stdout value!

type Formatter = {
  format: (value: string) => string
}

function format(value: string, suffix: string = '!'): string {
  return value + suffix
}

const formatter: Formatter = {
  format
}

console.log(formatter.format('value'))
