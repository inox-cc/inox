// @targets cc
// @expect pass
// @stdout 0

import { Buffer } from 'node:buffer'

function isBuffer(value: unknown): boolean {
  return Buffer.isBuffer(value)
}

console.log(isBuffer(new Uint8Array(1)))
