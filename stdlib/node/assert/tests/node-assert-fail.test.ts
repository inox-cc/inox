// @targets cc
// @expect pass
// @stdout failed intentionally

import assert from 'node:assert'

try {
  assert.fail('failed intentionally')
} catch (error) {
  console.log((error as { message: string }).message)
}
