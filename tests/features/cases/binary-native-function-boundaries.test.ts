// @targets cc
// @expect pass
// @stdout 2 1

import { Buffer } from 'node:buffer'

function passBytes(value: Uint8Array): Uint8Array {
  return value
}

function passBuffer(value: Buffer): Buffer {
  return value
}

console.log(passBytes(new Uint8Array(2)).length, passBuffer(Buffer.from('x')).length)
