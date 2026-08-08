// @targets cc
// @expect pass
// @stdout assert throws ok

import assert from 'node:assert'

assert.throws(() => {
  throw new Error('expected')
})
assert.doesNotThrow(() => {})
console.log('assert throws ok')
