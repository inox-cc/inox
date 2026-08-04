// @targets js cc
// @expect pass
// @stdout -1 0 1

import { Buffer } from 'node:buffer'

const a = Buffer.from('a')
const b = Buffer.from('b')

console.log(Buffer.compare(a, b), a.compare(a), b.compare(a))
