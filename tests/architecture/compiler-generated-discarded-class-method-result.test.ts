import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'

test('generated C++ discards an unused class method result without a temporary expression', () => {
  const result = compileSource(
    `
      type Item = { value: number }

      class Reader {
        read(): Item {
          return { value: 1 }
        }
      }

      function run(): void {
        const reader = new Reader()
        reader.read()
      }

      run()
    `,
    { target: 'cc' }
  )

  assert.match(result.code, /reader\.read\(\);/)
  assert.doesNotMatch(result.code, /inox_method_(?:value|result)_\d+;/)
})
