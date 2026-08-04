// @targets cc
// @expect pass
// @stdout aZc

import { Buffer } from 'node:buffer'

const bytes = Buffer.from('abc')
const view = bytes.subarray(1)
view[0] = 90
console.log(bytes.toString())
