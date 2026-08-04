// @targets cc
// @expect pass
// @stdout 1 1 1 3 1

import os from 'node:os'

const total = os.totalmem()
const freeMemory = os.freemem()
const load = os.loadavg()

console.log(total > 0, freeMemory >= 0 && freeMemory <= total, os.uptime() >= 0, load.length, load[0] >= 0)
