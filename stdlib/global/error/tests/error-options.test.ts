// @targets cc
// @expect pass
// @stdout 1
// @stdout 1
// @stdout boom

const plain = new Error()
const error = new Error('boom', { cause: 'root' })

console.log(plain.message === '')
console.log(error.cause === 'root')
console.log(error.message)
