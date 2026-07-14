// @targets cc
// @expect pass
// @stdout 0

function copyDate(value: Date): Date {
  return value
}

const copied: Date = copyDate(new Date(0))
console.log(copied.getTime())
