// @targets cc
// @expect pass
// @stdout 1

import path from 'node:path'
console.log(path.isAbsolute('/tmp/a'))
