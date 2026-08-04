// @targets js cc
// @expect pass
// @stdout 1

import { chdir, cwd } from 'node:process'

const before = cwd()
chdir('.')
console.log(cwd() === before)
