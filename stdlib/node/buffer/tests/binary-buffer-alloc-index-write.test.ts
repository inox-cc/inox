// @targets c
// @expect pass
// @stdout A

import { Buffer } from 'node:buffer'
const bytes = Buffer.alloc(1)
bytes[0] = 65
console.log(bytes.toString())
