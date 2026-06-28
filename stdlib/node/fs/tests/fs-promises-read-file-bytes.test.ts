// @targets cc
// @expect pass
// @stdout bytes

import fs from 'node:fs'
import process from 'node:process'
const file = '/private/tmp/inox-fs-p-bytes-' + String(process.pid) + '.txt'
await fs.promises.writeFile(file, 'bytes')
const bytes = await fs.promises.readFile(file)
console.log(bytes.toString())
await fs.promises.unlink(file)
