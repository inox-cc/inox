// @targets cc
// @expect pass
// @stdout ok

import fs from 'node:fs'
import process from 'node:process'
const file = '/private/tmp/inox-fs-access-' + String(process.pid) + '.txt'
fs.writeFileSync(file, 'x')
fs.accessSync(file, fs.constants.F_OK)
console.log('ok')
fs.unlinkSync(file)
