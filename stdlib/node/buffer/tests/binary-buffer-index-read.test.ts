// @targets cc
// @expect pass
// @stdout 104

import { Buffer } from 'node:buffer'
const bytes = Buffer.from('hi')
console.log(bytes[0])
