// @targets cc
// @expect pass
// @stdout item.txt
// @stdout 1

import fs from 'node:fs'
import process from 'node:process'

const dir = '/private/tmp/inox-fs-p-readdir-dirents-' + String(process.pid)
await fs.promises.mkdir(dir, { recursive: true })
await fs.promises.writeFile(dir + '/item.txt', 'x')
const entries = await fs.promises.readdir(dir, { withFileTypes: true })
for (const entry of entries) {
  console.log(entry.name)
  console.log(entry.isFile())
}
await fs.promises.rm(dir, { recursive: true, force: true })
