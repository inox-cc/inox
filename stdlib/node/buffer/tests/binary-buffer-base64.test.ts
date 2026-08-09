// @targets js cc
// @expect pass
// @stdout hello hello hello aGVsbG8= 6

import { Buffer } from 'node:buffer'

const padded = Buffer.from('aGVsbG8=', 'base64')
const unpadded = Buffer.from('aGVsbG8', 'base64')
const noisy = Buffer.from('aG Vs\nbG8=', 'base64')

console.log(
  padded.toString(),
  unpadded.toString(),
  noisy.toString(),
  padded.toString('base64'),
  Buffer.byteLength('aG Vs\nbG8=', 'base64')
)
