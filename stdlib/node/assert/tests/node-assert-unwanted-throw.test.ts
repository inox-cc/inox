// @targets cc
// @expect pass
// @stdout exception forbidden

import assert from 'node:assert'

try {
  assert.doesNotThrow(() => {
    throw new Error('boom')
  }, 'exception forbidden')
} catch (error) {
  console.log((error as { message: string }).message)
}
