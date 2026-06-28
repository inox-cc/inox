// @targets js cc
// @expect pass
// @stdout 1

import { memoryUsage } from 'node:process'

const usage = memoryUsage()

console.log(usage.rss >= 0)
