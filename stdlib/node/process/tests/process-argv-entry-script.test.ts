// @targets js c
// @expect pass
// @stdout 1
// @stdout 1

import process from 'node:process'

console.log(process.argv.length === 2)
console.log(process.argv[1].endsWith('process-argv-entry-script.test.ts'))
