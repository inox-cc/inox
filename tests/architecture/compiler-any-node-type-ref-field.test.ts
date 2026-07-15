import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compilerAnyNodeObjectFields } from '../../compiler/c/values/any-node-fields.ts'
import { anyNodeObjectShape } from '../../compiler/checker/resolved-types.ts'

test('self-hosted AnyNode fallback reserves generic TypeRef metadata', () => {
  assert.ok(compilerAnyNodeObjectFields.includes('typeRef'))
  assert.equal(compilerAnyNodeObjectFields.filter((field) => field === 'typeRef').length, 1)
  assert.equal(compilerAnyNodeObjectFields.filter((field) => field === 'returnTypeRef').length, 1)

  const shape = anyNodeObjectShape({ line: 1, column: 1 })
  const returnTypeRef = shape.fields.find((candidate) => candidate.name === 'returnTypeRef')

  assert.equal(returnTypeRef?.valueType, 'object')
  assert.equal(returnTypeRef?.nullable, true)
})

test('self-hosted AnyNode reserves array element shape metadata', () => {
  assert.equal(compilerAnyNodeObjectFields.filter((field) => field === 'arrayElementShape').length, 1)

  const shape = anyNodeObjectShape({ line: 1, column: 1 })
  const field = shape.fields.find((candidate) => candidate.name === 'arrayElementShape')

  assert.equal(field?.valueType, 'object')
  assert.equal(field?.nullable, true)
})
