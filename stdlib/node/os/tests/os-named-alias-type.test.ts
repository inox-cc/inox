// @targets cc
// @expect pass
// @stdout 1

import { type as osType } from 'node:os'
console.log(osType().length > 0)
