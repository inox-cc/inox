import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('conditional expression переносит pending exception effects обеих веток', () => {
  const result = compileSource(
    "function fail(): string { throw 'boom' }\n" +
      'function choose(flag: boolean): string { return flag ? fail() : fail() }\n',
    { libraries: defaultCompilerLibrarySet, target: 'cc' }
  )

  assert.match(result.code, /inox::String choose\(bool flag\)/)
  assert.equal(result.code.match(/if \(inox::thrown\(\)\) return \{\};/g)?.length, 2)
  assert.doesNotMatch(result.code, /\binox_status\b/)
  assert.doesNotMatch(result.code, /\binox_error_out\b/)
})
