// @targets cc
// @expect pass
// @stdout 0

function copyDateOrThrow(value: Date, fail: boolean): Date {
  if (fail) {
    throw new Error('failed')
  }

  return value
}

try {
  const copied: Date = copyDateOrThrow(new Date(0), false)
  console.log(copied.getTime())
} catch (error) {
  console.log(error)
}
