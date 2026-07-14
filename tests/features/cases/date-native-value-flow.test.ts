// @targets cc
// @expect pass
// @stdout 0
// @stdout 0

function timestamp(value: Date): number {
  return value.getTime()
}

const original: Date = new Date(0)
const copy: Date = new Date(original)

console.log(timestamp(original))
console.log(copy.valueOf())
