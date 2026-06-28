// @targets c
// @expect pass
// @stdout file

import path from 'node:path'
const parsed = path.parse('/tmp/file.txt')
console.log(parsed.name)
