import assert from 'node:assert/strict'

import { compileSource } from '../../compiler/core.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

export function assertLibraryPendingExceptionsPropagateThroughFunctions(): void {
  const result = compileSource(
    `
function fail(): void {
  JSON.parse('{')
}

function forward(): void {
  fail()
  console.log('unexpected')
}

try {
  forward()
} catch {
  console.log('caught')
}
`,
    {
      libraries: defaultCompilerLibrarySet,
      target: 'cc'
    }
  )

  assert.match(result.code, /fail\(\);\n\s+if \(inox::thrown\(\)\) return;/)
  assert.match(result.code, /forward\(\);\n\s+if \(inox::thrown\(\)\) goto catch_0;/)
  assert.doesNotMatch(result.code, /inox_status fail\(/)
  assert.doesNotMatch(result.code, /inox_status forward\(/)
}
