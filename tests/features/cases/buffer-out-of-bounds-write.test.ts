// @targets cc
// @expect pass
// @stdout 0

import { Buffer } from 'node:buffer'

const bytes = Buffer.alloc(1)
bytes[1] = 7
console.log(bytes[0])
