// @targets c
// @expect pass
// @stdout 1

import fs from 'node:fs'
import process from 'node:process'
const file = '/private/tmp/inox-fs-realpath-' + String(process.pid) + '.txt'
fs.writeFileSync(file, 'x')
const resolved = fs.realpathSync(file)
console.log(resolved.endsWith('.txt'))
fs.unlinkSync(file)
