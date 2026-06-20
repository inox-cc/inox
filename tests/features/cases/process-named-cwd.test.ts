// @targets c
// @expect pass
// @stdout 1

import { cwd } from 'node:process'
console.log(cwd().length > 0)
