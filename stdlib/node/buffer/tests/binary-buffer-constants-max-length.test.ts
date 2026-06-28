// @targets c
// @expect pass
// @stdout 1

import { constants } from 'node:buffer'
console.log(constants.MAX_LENGTH > 0)
