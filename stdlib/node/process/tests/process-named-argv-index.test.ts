// @targets js cc
// @expect pass
// @stdout 1

import { argv } from 'node:process'

console.log(argv[0].length > 0)
