// @targets c
// @expect pass
// @stdout hi

import { execFileSync } from 'node:child_process'
console.log(execFileSync('/bin/echo', ['hi'], { encoding: 'utf8' }).trim())
