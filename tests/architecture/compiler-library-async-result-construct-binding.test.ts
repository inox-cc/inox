import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compilerLibraryPackage as promiseCompilerLibraryPackage } from '../../stdlib/global/promise/compiler/index.ts'
import {
  compilerLibraryPackageWithGlobalDeclaration,
  createCompilerLibrarySetWithCollections as createCompilerLibrarySet
} from './helpers/compiler-library-fixtures.ts'

test('async-result construct binding совпадает с operation role', () => {
  const library = compilerLibraryPackageWithGlobalDeclaration(
    promiseCompilerLibraryPackage,
    'stdlib/global/promise/index.d.ts'
  )
  library.operations = library.operations.map((operation) => ({ ...operation }))
  const construct = library.operations.find((operation) => operation.asyncResultOperation === 'create')

  assert.notEqual(construct, undefined)

  if (typeof construct === 'undefined') {
    return
  }

  construct.asyncResultOperation = null
  library.operations.push({
    ...construct,
    bindingId: `${construct.bindingId}.detached`,
    operationId: `${construct.operationId}.detached`,
    asyncResultOperation: 'create'
  })

  assert.throws(
    () => createCompilerLibrarySet([library]),
    /construct operation .* must declare async-result construct role/
  )
})
