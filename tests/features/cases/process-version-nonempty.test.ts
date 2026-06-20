// @targets c
// @expect pass
// @stdout 1

import process from 'node:process'
console.log(process.version.length > 0)
