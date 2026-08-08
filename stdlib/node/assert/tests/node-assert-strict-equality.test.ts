// @targets cc
// @expect pass
// @stdout assert strict ok

import assert, { notStrictEqual, strictEqual } from 'node:assert'

assert.ok('ready')
assert.strictEqual('inox', 'inox')
strictEqual(4, 4)
notStrictEqual(4, 5)
console.log('assert strict ok')
