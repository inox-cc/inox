// @targets cc
// @expect pass
// @stdout ADA

function resultOf<T>(callback: () => T): T {
  return callback()
}

function name(): string {
  return 'Ada'
}

const value = resultOf(name)
console.log(value.toUpperCase())
