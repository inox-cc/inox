// @targets c
// @expect pass
// @stdout item.txt

import fs from 'node:fs'
import process from 'node:process'
const dir = '/private/tmp/inox-fs-dir-' + String(process.pid)
fs.mkdirSync(dir, { recursive: true })
fs.writeFileSync(dir + '/item.txt', 'x')
const entries = fs.readdirSync(dir)
for (const entry of entries) {
  console.log(entry)
}
fs.rmSync(dir, { recursive: true, force: true })
