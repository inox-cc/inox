// @targets cc
// @expect pass
// @stdout Zb

import { Buffer } from 'node:buffer'

const bytes = Buffer.from('ab')
const slice = bytes.slice(0, 1)
slice[0] = 90
console.log(bytes.toString())
