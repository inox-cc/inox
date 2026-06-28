// @targets cc
// @expect pass
// @stdout 1

import { EOL } from 'node:os'
console.log(EOL === '\n')
