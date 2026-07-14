// @targets cc
// @expect pass
// @stdout 3
// @stdout 0

import { defaultScalars } from './modules/default-scalars.ts'

console.log(defaultScalars())
console.log(defaultScalars(7, false))
