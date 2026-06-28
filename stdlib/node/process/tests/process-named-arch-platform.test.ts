// @targets cc
// @expect pass
// @stdout 1
// @stdout 1

import { arch, platform } from 'node:process'

console.log(arch.length > 0)
console.log(platform.length > 0)
