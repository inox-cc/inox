// @targets c
// @expect pass
// @stdout ok

import fs from 'node:fs'
import process from 'node:process'
const file = '/private/tmp/inox-fs-p-access-' + String(process.pid) + '.txt'
await fs.promises.writeFile(file, 'x')
await fs.promises.access(file, fs.constants.F_OK)
console.log('ok')
await fs.promises.unlink(file)
