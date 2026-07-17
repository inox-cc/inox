import assert from 'node:assert/strict'
import { test } from 'node:test'

import { unresolvedTypeInfo } from '../../compiler/checker/declared-types.ts'

test('placeholder resolved type reserves neutral TypeRef metadata', () => {
  const info = unresolvedTypeInfo()

  assert.ok(Object.hasOwn(info, 'typeRef'))
  assert.equal(Object.hasOwn(info, 'arrayElementFunctionType'), false)
})
