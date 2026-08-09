// @targets js cc
// @expect pass
// @stdout inox 1a 1 3

import { Buffer } from 'node:buffer'

const complete = Buffer.from('696e6f78', 'hex')
const truncated = Buffer.from('1a7', 'hex')
const invalid = Buffer.from('1ag123', 'hex')

console.log(complete.toString(), truncated.toString('hex'), invalid.length, Buffer.byteLength('1ag123', 'hex'))
