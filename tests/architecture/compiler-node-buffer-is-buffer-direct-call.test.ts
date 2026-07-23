import assert from 'node:assert/strict'
import test from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('Buffer.isBuffer emits a direct non-throwing C++ call', () => {
  const result = compileSource(
    `
import { Buffer } from 'node:buffer'

function report(value: unknown): void {
  console.log(Buffer.isBuffer(value))
}
`,
    {
      libraries: defaultCompilerLibrarySet,
      target: 'cc'
    }
  )

  assert.match(result.code, /console\.log\("%d", Buffer::isBuffer\(value\)\);/)
  assert.doesNotMatch(result.code, /inox_library_result_/)
  assert.doesNotMatch(result.code, /if \(inox::thrown\(\)\) return;/)
})
