// @targets cc
// @expect pass
// @stdout 0:hi:true

import { spawnSync } from 'node:child_process'
const result = spawnSync('/bin/echo', ['hi'], { encoding: 'utf8' })
console.log(`${result.status}:${result.stdout.trim()}:${result.stderr === ''}`)
