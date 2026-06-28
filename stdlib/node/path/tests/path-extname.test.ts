// @targets cc
// @expect pass
// @stdout .txt

import path from 'node:path'
console.log(path.extname('/tmp/a/file.txt'))
