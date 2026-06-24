// @targets c
// @expect pass
// @stdout item.txt
// @stdout 1

import fs from 'node:fs'
import process from 'node:process'

const dir = '/private/tmp/inox-fs-readdir-dirents-' + String(process.pid)
fs.mkdirSync(dir, { recursive: true })
fs.writeFileSync(dir + '/item.txt', 'x')
const entries = fs.readdirSync(dir, { withFileTypes: true })
for (const entry of entries) {
  console.log(entry.name)
  console.log(entry.isFile())
}
fs.rmSync(dir, { recursive: true, force: true })
