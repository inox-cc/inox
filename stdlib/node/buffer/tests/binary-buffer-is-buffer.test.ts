// @targets c
// @expect pass
// @stdout 1

import { Buffer } from 'node:buffer'
const bytes = Buffer.from('x')
console.log(Buffer.isBuffer(bytes))
