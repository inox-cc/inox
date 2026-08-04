// @targets js cc
// @expect pass
// @stdout 2 4

import { Buffer } from 'node:buffer'

console.log(Buffer.byteLength('½'), Buffer.byteLength('inox', 'utf8'))
