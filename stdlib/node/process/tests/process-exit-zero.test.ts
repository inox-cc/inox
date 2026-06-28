// @targets js cc
// @expect pass

import process from 'node:process'

process.exit(0)
console.log('unreachable')
