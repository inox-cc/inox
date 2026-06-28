// @targets cc
// @expect pass
// @stdout bc

import { Buffer } from 'node:buffer'
const bytes = Buffer.from('abcd')
console.log(bytes.slice(1, 3).toString())
