// @targets cc
// @expect pass
// @stdout async

import fs from 'node:fs'
import process from 'node:process'
const file = '/private/tmp/inox-fs-async-' + String(process.pid) + '.txt'
await fs.promises.writeFile(file, 'async')
console.log(await fs.promises.readFile(file, 'utf8'))
await fs.promises.unlink(file)
