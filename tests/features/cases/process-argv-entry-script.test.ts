// @targets js c
// @expect pass
// @stdout 1
// @stdout 1

import { name } from './modules/name.ts'
import process from 'node:process'

console.log(process.argv.length === 2)
console.log(name.length > 0 && process.argv[1].endsWith('process-argv-entry-script.test.ts'))
