// @targets c
// @expect pass
// @stdout 1

import os from 'node:os'
console.log(os.homedir().length >= 0)
