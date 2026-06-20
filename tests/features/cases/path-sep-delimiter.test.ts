// @targets c
// @expect pass
// @stdout /:

import path from 'node:path'
console.log(path.sep + path.delimiter)
