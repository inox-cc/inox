// @targets js,c
// @expect pass

import fs from 'node:fs'

await fs.promises.writeFile('/private/tmp/ccjs-fs-smoke.txt', 'hello fs')
const text = await fs.promises.readFile('/private/tmp/ccjs-fs-smoke.txt', 'utf8')
console.log(text)
