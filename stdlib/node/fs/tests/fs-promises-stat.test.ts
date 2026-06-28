// @targets cc
// @expect pass
// @stdout 1

import fs from 'node:fs'
import process from 'node:process'
const file = '/private/tmp/inox-fs-async-stat-' + String(process.pid) + '.txt'
await fs.promises.writeFile(file, 'x')
const stats = await fs.promises.stat(file)
console.log(stats.isFile())
await fs.promises.unlink(file)
