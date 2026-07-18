import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('conditional expression переносит throwing effects обеих веток', () => {
  const result = compileSource(
    "function fail(): string { throw 'boom' }\n" +
      'function choose(flag: boolean): string { return flag ? fail() : fail() }\n',
    { libraries: defaultCompilerLibrarySet, target: 'cc' }
  )

  assert.match(result.code, /inox_status choose\(/)
  assert.equal(result.code.match(/if \(inox_call_status_\d+ == INOX_ERR_THROW\)/g)?.length, 2)
})
