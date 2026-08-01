// @targets cc
// @expect pass
// @stdout optional

type Formatter = {
  format: (value: string, suffix?: string) => string
}

function format(value: string, suffix: string = ''): string {
  return value + suffix
}

const formatter: Formatter = {
  format
}

console.log(formatter.format('optional'))
