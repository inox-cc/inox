import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'

test('numeric compound assignment preserves direct operators in generated C++', () => {
  const result = compileSource(
    `
      function calculate(): number {
        let value = 8
        value += 4
        value -= 2
        value *= 3
        value /= 2
        value %= 5
        return value
      }
      calculate()
    `,
    { target: 'cc' }
  )

  assert.match(result.code, /value \+= 4;/)
  assert.match(result.code, /value -= 2;/)
  assert.match(result.code, /value \*= 3;/)
  assert.match(result.code, /value \/= 2;/)
  assert.match(result.code, /value = fmod\(value, 5\);/)
})
