// @targets c
// @expect pass
// @stdout bytes

import fs from 'node:fs'
import { Buffer } from 'node:buffer'
import process from 'node:process'
const file = '/private/tmp/inox-fs-p-write-buffer-' + String(process.pid) + '.txt'
await fs.promises.writeFile(file, Buffer.from('bytes'))
console.log(await fs.promises.readFile(file, 'utf8'))
await fs.promises.unlink(file)
