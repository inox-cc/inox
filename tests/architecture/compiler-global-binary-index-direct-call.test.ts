import assert from 'node:assert/strict'
import test from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('binary scalar access emits direct non-throwing C++ calls', () => {
  const result = compileSource(
    `
function report(bytes: Uint8Array): void {
  bytes[0] = 7
  console.log(bytes.length, bytes[0])
}
`,
    {
      libraries: defaultCompilerLibrarySet,
      target: 'cc'
    }
  )

  assert.match(result.code, /Uint8Array\(bytes\)\.set\(0, 7\);/)
  assert.match(result.code, /Uint8Array\(bytes\)\.length\(\)/)
  assert.match(result.code, /Uint8Array\(bytes\)\.get\(0\)/)
  assert.doesNotMatch(result.code, /if \(inox::thrown\(\)\) return;/)
})
