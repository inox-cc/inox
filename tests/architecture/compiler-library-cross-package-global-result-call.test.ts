import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('global operation result вызывает receiver operation другого package', () => {
  const result = compileSource("process.version.startsWith('v')\n", {
    libraries: defaultCompilerLibrarySet,
    target: 'cc'
  })

  assert.match(result.code, /\.startsWith\(/)
})
