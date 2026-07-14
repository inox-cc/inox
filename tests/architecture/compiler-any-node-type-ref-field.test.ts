import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compilerAnyNodeObjectFields } from '../../compiler/c/values/any-node-fields.ts'

test('self-hosted AnyNode fallback reserves generic TypeRef metadata', () => {
  assert.ok(compilerAnyNodeObjectFields.includes('typeRef'))
  assert.equal(compilerAnyNodeObjectFields.filter((field) => field === 'typeRef').length, 1)
})
