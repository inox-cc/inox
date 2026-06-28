// @targets cc
// @expect pass
// @stdout 0

const callbacks: (() => string)[] = []

console.log(callbacks.length)
