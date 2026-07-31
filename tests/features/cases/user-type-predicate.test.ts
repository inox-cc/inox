// @targets cc
// @expect pass
// @stdout ADA

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

const value: unknown = 'Ada'

if (isString(value)) {
  console.log(value.toUpperCase())
}
