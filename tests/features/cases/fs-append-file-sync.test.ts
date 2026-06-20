// @targets c
// @expect pass
// @stdout hello world

import fs from 'node:fs'
import process from 'node:process'
const file = '/private/tmp/inox-fs-append-' + String(process.pid) + '.txt'
fs.writeFileSync(file, 'hello')
fs.appendFileSync(file, ' world')
console.log(fs.readFileSync(file, 'utf8'))
fs.unlinkSync(file)
