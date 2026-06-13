// @targets c
// @expect pass

import fs from 'node:fs'

const text = fs.promises.readFile('/tmp/value.txt', 'utf8')
fs.promises.writeFile('/tmp/out.txt', 'saved')
