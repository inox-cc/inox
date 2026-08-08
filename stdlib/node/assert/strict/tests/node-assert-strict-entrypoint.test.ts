// @targets cc
// @expect pass
// @stdout assert strict entrypoint ok

import assert, { deepStrictEqual } from 'node:assert/strict'

assert.strictEqual(7, 7)
deepStrictEqual(['a'], ['a'])
console.log('assert strict entrypoint ok')
