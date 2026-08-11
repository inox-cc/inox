import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('generated C++ discards an unused optional library result without a temporary expression', () => {
  const result = compileSource(
    `
      function add(values: Set<string> | null): void {
        values?.add('item')
      }

      add(null)
    `,
    { libraries: defaultCompilerLibrarySet, target: 'cc' }
  )

  assert.doesNotMatch(result.code, /inox_library_optional_result_\d+;/)
})
