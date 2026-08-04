// @targets cc
// @expect pass
// @stdout 1 1 1 1

import process from 'node:process'

const start = process.cpuUsage()
const delta = process.cpuUsage(start)

console.log(start.user >= 0, start.system >= 0, delta.user >= 0, delta.system >= 0)
