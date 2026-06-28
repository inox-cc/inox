// @targets cc
// @expect pass
// @stdout 2

import { Buffer } from 'node:buffer'
const bytes = Buffer.from('hi')
console.log(bytes.length)
