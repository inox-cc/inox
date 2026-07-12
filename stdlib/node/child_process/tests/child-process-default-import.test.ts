// @targets cc
// @expect pass
// @stdout hi
// @stdout 1

import childProcess from 'node:child_process'
console.log(childProcess.execSync('printf hi', { encoding: 'utf8' }))
console.log(childProcess.execFileSync('/bin/echo', { encoding: 'utf8' }) === '\n')
