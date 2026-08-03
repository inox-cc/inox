// @targets cc
// @expect pass
// @stdout 2

const callbacks: Function[] = []
callbacks.push(() => {}, () => {})
console.log(callbacks.length)
