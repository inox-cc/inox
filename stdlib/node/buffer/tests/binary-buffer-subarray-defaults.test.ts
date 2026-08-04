// @targets cc
// @expect pass
// @stdout abc bc

import { Buffer } from 'node:buffer'

const bytes = Buffer.from('abc')
console.log(bytes.subarray().toString(), bytes.subarray(1, 9).toString())
