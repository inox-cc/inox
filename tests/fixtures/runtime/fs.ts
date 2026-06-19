// @targets c
// @expect pass

import fs from 'node:fs'

await fs.promises.writeFile('/private/tmp/inox-fs-smoke.txt', 'hello fs')
const text = await fs.promises.readFile('/private/tmp/inox-fs-smoke.txt', 'utf8')
console.log(text)
