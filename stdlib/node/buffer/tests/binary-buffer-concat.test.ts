// @targets cc
// @expect pass
// @stdout inox! inox 4

import { Buffer } from 'node:buffer'

const first = Buffer.from('in')
const second = new Uint8Array([111, 120, 33])
const values: Uint8Array[] = [first, second]

console.log(Buffer.concat(values).toString(), Buffer.concat(values, 4).toString(), Buffer.concat(values, 4).length)
