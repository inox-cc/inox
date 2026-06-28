// @targets cc
// @expect pass
// @stdout hello

import fs from 'node:fs'
import process from 'node:process'
const file = '/private/tmp/inox-fs-' + String(process.pid) + '.txt'
fs.writeFileSync(file, 'hello')
console.log(fs.readFileSync(file, 'utf8'))
fs.unlinkSync(file)
