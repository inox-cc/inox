// @targets cc
// @expect pass
// @stdout 1
// @stdout E_TEST
// @stdout boom

const plain = new Error()
const cause = new Error('root')
const error = new Error('boom', { code: 'E_TEST', cause })

console.log(plain.message === '')
console.log(error.code)
console.log(error.message)
