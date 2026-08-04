// @targets cc
// @expect pass
// @stdout 3 0,98,99,100,0 4 aabcd

import { Buffer } from 'node:buffer'

const source = Buffer.from('abcd')
const target = new Uint8Array(5)
const copied = source.copy(target, 1, 1, 4)
const overlap = Buffer.from('abcde')
const overlapCount = overlap.copy(overlap, 1, 0, 4)

console.log(copied, target.toString(), overlapCount, overlap.toString())
