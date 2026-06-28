// @targets cc
// @expect pass
// @stdout 1

import fs from 'node:fs'
import process from 'node:process'
const dir = '/private/tmp/inox-fs-p-dir-' + String(process.pid)
await fs.promises.mkdir(dir, { recursive: true })
await fs.promises.writeFile(dir + '/item.txt', 'x')
const stats = await fs.promises.stat(dir)
console.log(stats.isDirectory())
await fs.promises.rm(dir, { recursive: true, force: true })
