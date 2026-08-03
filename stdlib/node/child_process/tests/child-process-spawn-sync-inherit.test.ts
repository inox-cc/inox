// @targets cc
// @expect pass
// @stdout inherited
// @stdout 0 0 0

import { spawnSync } from 'node:child_process'

const result = spawnSync('/bin/echo', ['inherited'], { encoding: 'utf8', stdio: 'inherit' })
console.log(result.status, result.stdout.length, result.stderr.length)
