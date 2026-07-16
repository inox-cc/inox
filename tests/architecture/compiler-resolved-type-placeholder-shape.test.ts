import assert from 'node:assert/strict'
import { test } from 'node:test'

import { unresolvedTypeInfo } from '../../compiler/checker/declared-types.ts'

test('placeholder resolved type reserves generic and base refreshable metadata fields', () => {
  const info = unresolvedTypeInfo()

  assert.ok(Object.hasOwn(info, 'arrayElementFunctionType'))
  assert.ok(Object.hasOwn(info, 'typeRef'))
})
