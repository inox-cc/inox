// @targets c
// @expect pass
// @stdout hi

import { spawnSync } from 'node:child_process'
const result = spawnSync('/bin/echo', ['hi'], { encoding: 'utf8' })
console.log(result.stdout.trim())
