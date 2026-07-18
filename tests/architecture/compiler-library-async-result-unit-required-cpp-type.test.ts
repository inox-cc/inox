import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { uncheckedIncompleteAsyncResultLibrarySet } from './helpers/compiler-async-result-fixtures.ts'

test('unit emission не выбирает raw type для incomplete async-result provider', () => {
  assert.throws(
    () =>
      compileSource('const task = makeTask()\n', {
        libraries: uncheckedIncompleteAsyncResultLibrarySet(),
        target: 'cc'
      }),
    /Compiler library intrinsic provider async-result requires a resolvable native C\+\+ result type/
  )
})
