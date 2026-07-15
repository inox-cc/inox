// @targets cc
// @expect pass
// @stdout buffer:hi/A/bc/true
// @stdout uint8:7/66/4
// @stdout clocks:true/true/true

import { Buffer, constants } from 'node:buffer'

const text = Buffer.from('hi')
const allocated = Buffer.alloc(2)
allocated[0] = 65
allocated[1] = 66
const sliced = Buffer.from('abcd').slice(1, 3)

const bytes = new Uint8Array([65, 66, 67])
const mutable = new Uint8Array(1)
mutable[0] = 7
const random = new Uint8Array(4)
const same = crypto.getRandomValues(random)

console.log(
  'buffer:' +
    text.toString() +
    '/' +
    allocated.slice(0, 1).toString() +
    '/' +
    sliced.toString() +
    '/' +
    String(Buffer.isBuffer(text))
)
console.log('uint8:' + String(mutable[0]) + '/' + bytes.slice(1, 2).toString() + '/' + String(same.length))
console.log(
  'clocks:' + String(constants.MAX_LENGTH > 0) + '/' + String(Date.now() > 0) + '/' + String(performance.now() >= 0)
)
