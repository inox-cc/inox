// @targets c
// @expect pass
// @stdout file.txt

import path from 'node:path'
const parsed = path.parse('/tmp/file.txt')
console.log(parsed.base)
