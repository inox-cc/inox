// @targets js c
// @expect pass
// @stdout 1
// @stdout 1
// @stdout 1
// @stdout 1
// @stdout 1

import process from 'node:process'

const usage = process.memoryUsage()

console.log(usage.rss >= 0)
console.log(usage.heapTotal >= 0)
console.log(usage.heapUsed >= 0)
console.log(usage.external >= 0)
console.log(usage.arrayBuffers >= 0)
