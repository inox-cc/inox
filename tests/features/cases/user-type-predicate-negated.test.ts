// @targets cc
// @expect pass
// @stdout ADA

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function printString(value: unknown): void {
  if (!isString(value)) {
    return
  }

  console.log(value.toUpperCase())
}

printString('Ada')
