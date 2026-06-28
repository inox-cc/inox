// @targets c
// @expect pass
// @stdout 1

import fs from 'node:fs'
import process from 'node:process'
const target = '/private/tmp/inox-fs-p-target-' + String(process.pid) + '.txt'
const link = '/private/tmp/inox-fs-p-link-' + String(process.pid)
await fs.promises.writeFile(target, 'x')
await fs.promises.symlink(target, link)
console.log((await fs.promises.readlink(link)) === target)
await fs.promises.unlink(link)
await fs.promises.unlink(target)
