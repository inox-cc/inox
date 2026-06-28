// @targets c
// @expect pass
// @stdout cd

import { Buffer } from 'node:buffer'
const bytes = Buffer.from('abcd')
console.log(bytes.slice(-2).toString())
