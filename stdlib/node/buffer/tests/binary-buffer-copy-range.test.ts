// @targets cc
// @expect pass
// @stdout 1

import { Buffer } from 'node:buffer'

const source = Buffer.from('a')
const target = new Uint8Array(1)
let caught = false

try {
  source.copy(target, -1)
} catch {
  caught = true
}

console.log(caught)
