import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import {
  emptyCppAsyncResultLibrary,
  incompleteAsyncResultLibrary,
  incompleteAsyncResultOperationId
} from './helpers/compiler-async-result-fixtures.ts'

test('async-result provider требует разрешимый native C++ result type', () => {
  const diagnostic = new RegExp(
    `Compiler library intrinsic provider async-result construct operation ${incompleteAsyncResultOperationId} requires a resolvable native C\\+\\+ result type`
  )

  assert.throws(() => createCompilerLibrarySet([incompleteAsyncResultLibrary()]), diagnostic)
  assert.throws(() => createCompilerLibrarySet([emptyCppAsyncResultLibrary()]), diagnostic)
})
