// @targets c
// @expect pass
// @stdout .txt

import path from 'node:path'
const parsed = path.parse('/tmp/file.txt')
console.log(parsed.ext)
