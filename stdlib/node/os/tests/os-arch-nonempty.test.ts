// @targets cc
// @expect pass
// @stdout 1

import os from 'node:os'
console.log(os.arch().length > 0)
