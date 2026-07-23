// @targets cc
// @expect pass
// @stdout false

import { Buffer } from 'node:buffer'

console.log(String(Buffer.isBuffer([1, 'not-a-byte'])))
