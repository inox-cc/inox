import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'

test('generated C++ uses pointer-to-const storage for raw string literals', () => {
  const result = compileSource(
    `
      const moduleText = 'sample'

      function read(): string {
        const suffix = '-suffix'
        return suffix
      }

      read()
    `,
    { target: 'cc' }
  )

  assert.match(result.code, /static const char\* moduleText = "";/)
  assert.match(result.code, /const char\* suffix = "-suffix";/)
  assert.doesNotMatch(result.code, /(?:^|\n)\s*(?:static\s+)?char\*/)
})
