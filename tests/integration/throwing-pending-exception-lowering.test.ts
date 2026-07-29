import assert from 'node:assert/strict'

import { compileSource } from '../../compiler/core.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

export function assertThrowingUsesPendingExceptionChannel(): void {
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
      libraries: defaultCompilerLibrarySet,
      target: 'cc'
    }
  )

  assert.match(result.code, /inox::throw_value\(inox_throw_error_\d+\);/)
  assert.match(result.code, /fail\(\);\n\s+if \(inox::thrown\(\)\) goto catch_\d+;/)
  assert.match(result.code, /auto inox_error = inox::take_exception\(\);/)
  assert.doesNotMatch(result.code, /\binox_error_out\b/)
  assert.doesNotMatch(result.code, /\binox_status\b/)
}
