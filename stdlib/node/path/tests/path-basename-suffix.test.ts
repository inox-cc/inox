// @targets cc
// @expect pass
// @stdout file

import path from 'node:path'
console.log(path.basename('/tmp/file.txt', '.txt'))
