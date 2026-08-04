// @targets js cc
// @expect pass
// @stdout 1 0

import { Buffer } from 'node:buffer'

const value = Buffer.from('inox')

console.log(value.equals(Buffer.from('inox')), value.equals(Buffer.from('other')))
