// @targets cc
// @expect pass
// @stdout AssertionError numbers differ strictEqual 0 1 2

import assert from 'node:assert'

try {
  assert.strictEqual(1, 2, 'numbers differ')
} catch (error) {
  const failure = error as {
    name: string
    message: string
    operator: string
    generatedMessage: boolean
    actual: number
    expected: number
  }
  console.log(
    failure.name,
    failure.message,
    failure.operator,
    failure.generatedMessage,
    failure.actual,
    failure.expected
  )
}
