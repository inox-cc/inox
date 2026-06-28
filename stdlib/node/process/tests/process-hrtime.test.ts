// @targets js cc
// @expect pass
// @stdout 1
// @stdout 1
// @stdout 1
// @stdout 1
// @stdout 1
// @stdout 1

import process from 'node:process'

const start = process.hrtime()
const delta = process.hrtime(start)

console.log(start.length === 2)
console.log(start[0] >= 0)
console.log(start[1] >= 0)
console.log(delta.length === 2)
console.log(delta[0] >= 0)
console.log(delta[1] >= 0)
