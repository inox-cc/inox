// @targets cc
// @expect pass
// @stdout 1

import buffer from 'node:buffer'
console.log(buffer.constants.MAX_LENGTH > 0)
