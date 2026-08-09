// @targets cc
// @expect pass
// @stdout 1234

function timestamp(value: { createdAt: Date }): number {
  return value.createdAt.getTime()
}

console.log(timestamp({ createdAt: new Date(1234) }))
