// @targets cc
// @expect pass
// @stdout async append

import fs from 'node:fs'
import process from 'node:process'
const file = '/private/tmp/inox-fs-p-append-' + String(process.pid) + '.txt'
await fs.promises.writeFile(file, 'async')
await fs.promises.appendFile(file, ' append')
console.log(await fs.promises.readFile(file, 'utf8'))
await fs.promises.unlink(file)
