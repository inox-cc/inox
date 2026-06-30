import assert from 'node:assert/strict'

import { compileSource } from '../../compiler/core.ts'

export function assertThrowingErrorTransferUsesValueRelease(): void {
  const result = compileSource(
    `
function fail(): void {
  throw 'boom'
}

try {
  fail()
} catch (error) {
  console.log(error)
}
`,
    {
      target: 'cc'
    }
  )

  assert.match(result.code, /\*inox_error_out = inox_error\.release\(\);/)
  assert.doesNotMatch(result.code, /\*inox_error_out = inox_error;\n\s+inox_error = inox_undefined_value\(\);/)
}
