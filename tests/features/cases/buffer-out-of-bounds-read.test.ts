// @targets cc
// @expect pass
// @stdout 1

import { Buffer } from 'node:buffer'

const bytes = Buffer.alloc(1)
console.log(bytes[1] === undefined)
