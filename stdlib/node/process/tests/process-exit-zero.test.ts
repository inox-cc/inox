// @targets js c
// @expect pass

import process from 'node:process'

process.exit(0)
console.log('unreachable')
