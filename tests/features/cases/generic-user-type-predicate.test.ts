// @targets cc
// @expect pass
// @stdout ADA

function isPresent<T>(value: T | null): value is T {
  return value !== null
}

const value: string | null = 'Ada'

if (isPresent(value)) {
  console.log(value.toUpperCase())
}
