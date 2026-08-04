// @targets js cc
// @expect pass
// @stdout 1 0

import fs from 'node:fs'

console.log(fs.existsSync('package.json'), fs.existsSync('this-file-does-not-exist'))
