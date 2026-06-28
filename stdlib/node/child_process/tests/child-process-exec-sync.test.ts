// @targets cc
// @expect pass
// @stdout hi

import { execSync } from 'node:child_process'
console.log(execSync('printf hi', { encoding: 'utf8' }))
