// @targets cc
// @expect pass
// @stdout assert deep object ok

import assert from 'node:assert'

assert.deepStrictEqual({ name: 'inox', values: [1, 2] }, { values: [1, 2], name: 'inox' })
assert.notDeepStrictEqual({ values: [1, 2] }, { values: [1, 3] })
console.log('assert deep object ok')
