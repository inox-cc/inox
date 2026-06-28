// @targets cc
// @expect pass
// @stdout item.txt

import fs from 'node:fs'
import process from 'node:process'
const dir = '/private/tmp/inox-fs-p-readdir-' + String(process.pid)
await fs.promises.mkdir(dir, { recursive: true })
await fs.promises.writeFile(dir + '/item.txt', 'x')
const entries = await fs.promises.readdir(dir)
for (const entry of entries) {
  console.log(entry)
}
await fs.promises.rm(dir, { recursive: true, force: true })
