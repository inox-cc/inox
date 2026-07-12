// @targets cc
// @expect pass
// @stdout 1

import { execFileSync } from 'node:child_process'
console.log(execFileSync('/bin/echo', { encoding: 'utf8' }) === '\n')
