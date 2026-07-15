import assert from 'node:assert/strict'
import { test } from 'node:test'

import { unresolvedTypeInfo } from '../../compiler/checker/declared-types.ts'

test('placeholder resolved type reserves every refreshable metadata field', () => {
  const info = unresolvedTypeInfo()

  assert.ok(Object.hasOwn(info, 'arrayElementFunctionType'))
  assert.ok(Object.hasOwn(info, 'mapValueArrayElementType'))
  assert.ok(Object.hasOwn(info, 'mapValueArrayElementDeclaredType'))
})
