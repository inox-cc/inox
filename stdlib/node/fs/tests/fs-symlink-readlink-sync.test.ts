// @targets cc
// @expect pass
// @stdout 1

import fs from 'node:fs'
import process from 'node:process'
const target = '/private/tmp/inox-fs-target-' + String(process.pid) + '.txt'
const link = '/private/tmp/inox-fs-link-' + String(process.pid)
fs.writeFileSync(target, 'x')
fs.symlinkSync(target, link)
console.log(fs.readlinkSync(link) === target)
fs.unlinkSync(link)
fs.unlinkSync(target)
