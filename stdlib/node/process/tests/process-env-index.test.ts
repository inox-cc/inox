// @targets js cc
// @expect pass
// @stdout 1

const name = 'PATH'

console.log(process.env[name] === process.env.PATH)
