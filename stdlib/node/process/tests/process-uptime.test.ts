// @targets js cc
// @expect pass
// @stdout 1

import process from 'node:process'

console.log(process.uptime() >= 0)
