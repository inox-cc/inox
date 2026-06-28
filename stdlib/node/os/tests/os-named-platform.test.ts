// @targets cc
// @expect pass
// @stdout 1

import { platform } from 'node:os'
console.log(platform().length > 0)
