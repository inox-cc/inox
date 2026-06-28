// @targets cc
// @expect pass
// @stdout bytes

import fs from 'node:fs'
import { Buffer } from 'node:buffer'
import process from 'node:process'
const file = '/private/tmp/inox-fs-write-buffer-' + String(process.pid) + '.txt'
fs.writeFileSync(file, Buffer.from('bytes'))
console.log(fs.readFileSync(file, 'utf8'))
fs.unlinkSync(file)
