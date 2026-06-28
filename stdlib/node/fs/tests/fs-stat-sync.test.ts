// @targets cc
// @expect pass
// @stdout 1

import fs from 'node:fs'
import process from 'node:process'
const file = '/private/tmp/inox-fs-stat-' + String(process.pid) + '.txt'
fs.writeFileSync(file, 'x')
const stats = fs.statSync(file)
console.log(stats.isFile())
fs.unlinkSync(file)
