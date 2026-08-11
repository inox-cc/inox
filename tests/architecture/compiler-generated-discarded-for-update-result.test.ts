import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'

test('generated C++ discards the previous value of a postfix for update', () => {
  const result = compileSource(
    `
      function count(): number {
        let result = 0

        for (let index = 0; index < 2; index++) {
          result++
        }

        return result
      }

      count()
    `,
    { target: 'cc' }
  )

  assert.match(result.code, /inox_index\+\+;/)
  assert.doesNotMatch(result.code, /inox_update_previous_/)
})
