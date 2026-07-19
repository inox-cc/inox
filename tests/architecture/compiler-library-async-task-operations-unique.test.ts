import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { LibraryAsyncResultOperationKind } from '../../compiler/extensions/types.ts'
import { compilerLibraryPackage as promiseCompilerLibraryPackage } from '../../stdlib/global/promise/compiler/index.ts'
import { compilerLibraryPackageWithGlobalDeclaration } from './helpers/compiler-library-fixtures.ts'

test('async-result provider не допускает неоднозначные операции async task', () => {
  for (const kind of ['construct', 'resolve', 'reject', 'then'] as LibraryAsyncResultOperationKind[]) {
    const library = compilerLibraryPackageWithGlobalDeclaration(
      promiseCompilerLibraryPackage,
      'stdlib/global/promise/index.d.ts'
    )
    library.operations = library.operations.map((operation) => ({ ...operation }))
    const operation = library.operations.find((candidate) => candidate.asyncResultOperation === kind)

    assert.notEqual(operation, undefined)

    if (typeof operation === 'undefined') {
      continue
    }

    library.operations.push({
      ...operation,
      bindingId: `${operation.bindingId}.duplicate`,
      operationId: `${operation.operationId}.duplicate`
    })

    assert.throws(
      () => createCompilerLibrarySet([library]),
      new RegExp(`Compiler library intrinsic provider async-result requires exactly one ${kind} C\\+\\+ operation`)
    )
  }
})
