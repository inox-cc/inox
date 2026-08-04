// @targets cc
// @expect pass
// @stdout A

import { Buffer } from 'node:buffer'

const source = new Uint8Array([65])
const copy = Buffer.from(source)
source[0] = 66
console.log(copy.toString())
