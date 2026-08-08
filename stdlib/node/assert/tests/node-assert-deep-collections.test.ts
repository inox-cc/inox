// @targets cc
// @expect pass
// @stdout assert deep collections ok

import assert from 'node:assert'

assert.deepStrictEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))
assert.deepStrictEqual(new Set([1, 2]), new Set([2, 1]))
assert.deepStrictEqual(new Map([['a', 1], ['b', 2]]), new Map([['b', 2], ['a', 1]]))
console.log('assert deep collections ok')
