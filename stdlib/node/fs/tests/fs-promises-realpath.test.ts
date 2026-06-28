// @targets cc
// @expect pass
// @stdout 1

import fs from 'node:fs'
import process from 'node:process'
const file = '/private/tmp/inox-fs-p-realpath-' + String(process.pid) + '.txt'
await fs.promises.writeFile(file, 'x')
const resolved = await fs.promises.realpath(file)
console.log(resolved.endsWith('.txt'))
await fs.promises.unlink(file)
