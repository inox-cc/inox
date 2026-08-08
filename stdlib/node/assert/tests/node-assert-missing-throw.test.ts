// @targets cc
// @expect pass
// @stdout exception required

import assert from 'node:assert'

try {
  assert.throws(() => {}, 'exception required')
} catch (error) {
  console.log((error as { message: string }).message)
}
