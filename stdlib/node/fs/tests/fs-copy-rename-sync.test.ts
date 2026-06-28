// @targets c
// @expect pass
// @stdout copy

import fs from 'node:fs'
import process from 'node:process'
const base = '/private/tmp/inox-fs-copy-' + String(process.pid)
const source = base + '.txt'
const copy = base + '.copy'
const renamed = base + '.renamed'
fs.writeFileSync(source, 'copy')
fs.copyFileSync(source, copy)
fs.renameSync(copy, renamed)
console.log(fs.readFileSync(renamed, 'utf8'))
fs.unlinkSync(source)
fs.unlinkSync(renamed)
