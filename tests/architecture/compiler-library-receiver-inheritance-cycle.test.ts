import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import {
  receiverInheritanceLibrary,
  receiverNativeType,
  receiverTypeId
} from './helpers/compiler-native-receiver-inheritance-fixtures.ts'

test('native receiver inheritance cycles are rejected while building the library set', () => {
  assert.throws(
    () =>
      createCompilerLibrarySet([
        receiverInheritanceLibrary([
          receiverNativeType('First', [receiverTypeId('Second')]),
          receiverNativeType('Second', [receiverTypeId('First')])
        ])
      ]),
    /native type inheritance cycle/
  )
})
