// @targets cc
// @expect pass
// @stdout copy

import fs from 'node:fs'
import process from 'node:process'
const base = '/private/tmp/inox-fs-p-copy-' + String(process.pid)
const source = base + '.txt'
const copy = base + '.copy'
const renamed = base + '.renamed'
await fs.promises.writeFile(source, 'copy')
await fs.promises.copyFile(source, copy)
await fs.promises.rename(copy, renamed)
console.log(await fs.promises.readFile(renamed, 'utf8'))
await fs.promises.unlink(source)
await fs.promises.unlink(renamed)
