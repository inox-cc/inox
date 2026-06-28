// @targets cc
// @expect pass
// @stdout /tmp

import path from 'node:path'
const parsed = path.parse('/tmp/file.txt')
console.log(parsed.dir)
