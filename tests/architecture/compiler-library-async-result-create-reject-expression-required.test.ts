import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import { compilerLibraryPackage as promiseCompilerLibraryPackage } from '../../stdlib/global/promise/compiler/index.ts'
import { compilerLibraryPackageWithGlobalDeclaration } from './helpers/compiler-library-fixtures.ts'

test('async-result create operation требует непустой reject expression', () => {
  const library = compilerLibraryPackageWithGlobalDeclaration(
    promiseCompilerLibraryPackage,
    'stdlib/global/promise/index.d.ts'
  )
  library.operations = library.operations.map((operation) => ({ ...operation }))
  const operation = library.operations.find((candidate) => candidate.asyncResultOperation === 'create')

  assert.ok(operation)
  operation.cAsyncRejectExpression = null

  assert.throws(() => createCompilerLibrarySet([library]), {
    message: `Compiler library intrinsic provider async-result create operation ${operation.operationId} requires non-empty cAsyncRejectExpression`
  })
})
