// @targets cc
// @expect pass
// @stdout 1

import process from 'node:process'
console.log(process.argv[0].length > 0)
