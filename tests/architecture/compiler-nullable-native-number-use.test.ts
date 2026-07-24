import assert from 'node:assert/strict'
import test from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('nullable native numbers are converted before scalar use', () => {
  const result = compileSource('const bytes = new Uint8Array(1)\nconsole.log(bytes[0] >= 0)', {
    libraries: defaultCompilerLibrarySet,
    target: 'cc'
  })

  assert.match(result.code, /auto inox_nullable_scalar_\d+ = bytes\.get\(0\);/)
  assert.match(result.code, /inox_nullable_number_value\(inox_nullable_scalar_\d+\.raw\(\)\) >= 0/)
})
