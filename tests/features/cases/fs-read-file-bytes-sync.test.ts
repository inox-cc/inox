// @targets c
// @expect pass
// @stdout bytes

import fs from 'node:fs'
import process from 'node:process'
const file = '/private/tmp/inox-fs-bytes-' + String(process.pid) + '.txt'
fs.writeFileSync(file, 'bytes')
const bytes = fs.readFileSync(file)
console.log(bytes.toString())
fs.unlinkSync(file)
