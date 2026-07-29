import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import { compilerLibraryOperationForReceiver } from '../../compiler/extensions/library-set.ts'
import {
  receiverInheritanceLibrary,
  receiverNativeType,
  receiverOperation,
  receiverTypeId
} from './helpers/compiler-native-receiver-inheritance-fixtures.ts'

test('receiver operations are inherited once and child operations override them', () => {
  const baseTypeId = receiverTypeId('Base')
  const libraries = createCompilerLibrarySet([
    receiverInheritanceLibrary(
      [receiverNativeType('Base'), receiverNativeType('Derived', [baseTypeId])],
      [
        receiverOperation('Base', 'baseOnly', 'base-only'),
        receiverOperation('Base', 'shared', 'base-shared'),
        receiverOperation('Derived', 'shared', 'derived-shared')
      ]
    )
  ])
  const derivedTypeId = receiverTypeId('Derived')

  assert.equal(
    compilerLibraryOperationForReceiver(libraries, derivedTypeId, 'baseOnly', 'member-read')?.operationId,
    'fixture:receiver-inheritance#base-only'
  )
  assert.equal(
    compilerLibraryOperationForReceiver(libraries, derivedTypeId, 'shared', 'member-read')?.operationId,
    'fixture:receiver-inheritance#derived-shared'
  )
})
