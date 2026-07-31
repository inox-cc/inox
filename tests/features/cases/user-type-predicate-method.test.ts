// @targets cc
// @expect pass
// @stdout ADA

class Guard {
  isString(value: unknown): value is string {
    return typeof value === 'string'
  }
}

const value: unknown = 'Ada'
const guard = new Guard()

if (guard.isString(value)) {
  console.log(value.toUpperCase())
}
