// @targets cc
// @expect pass
// @stdout ok:2

type Base<T> = {
  value: T
}

type Extended<T> = Base<T> & {
  count: number
}

function format(value: Extended<string>): string {
  return value.value + ':' + value.count
}

console.log(format({ value: 'ok', count: 2 }))
