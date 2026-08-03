// @targets cc
// @expect pass
// @stdout dynamic

import { spawnSync } from 'node:child_process'

const args = ['dynamic']
const result = spawnSync('/bin/echo', args, { encoding: 'utf8' })
console.log(result.stdout.trim())
