import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import {
  receiverInheritanceLibrary,
  receiverNativeType,
  receiverOperation,
  receiverTypeId
} from './helpers/compiler-native-receiver-inheritance-fixtures.ts'

test('ambiguous inherited receiver operations require a child override', () => {
  assert.throws(
    () =>
      createCompilerLibrarySet([
        receiverInheritanceLibrary(
          [
            receiverNativeType('Left'),
            receiverNativeType('Right'),
            receiverNativeType('Child', [receiverTypeId('Left'), receiverTypeId('Right')])
          ],
          [
            receiverOperation('Left', 'shared', 'left-shared'),
            receiverOperation('Right', 'shared', 'right-shared')
          ]
        )
      ]),
    /Ambiguous inherited compiler library receiver operation/
  )
})
