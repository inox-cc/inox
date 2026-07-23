import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  compilerAnyNodeArrayFields,
  compilerAnyNodeBooleanFields,
  compilerAnyNodeStringArrayFields
} from '../../compiler/backends/cpp/values/any-node-fields.ts'
import { anyNodeObjectShape } from '../../compiler/checker/resolved-types.ts'

test('self-hosted AnyNode fallback сохраняет generic shape и function resolution metadata', () => {
  const shape = anyNodeObjectShape({ file: 'test.ts', line: 1, column: 1 })
  const baseTypes = shape.fields.find((field) => field.name === 'baseTypes')
  const resolved = shape.fields.find((field) => field.name === 'resolved')

  assert.equal(baseTypes?.declaredType, 'array<string>')
  assert.equal(baseTypes?.nullable, true)
  assert.equal(compilerAnyNodeArrayFields.includes('baseTypes'), true)
  assert.equal(compilerAnyNodeStringArrayFields.includes('baseTypes'), true)
  assert.equal(resolved?.valueType, 'boolean')
  assert.equal(resolved?.nullable, true)
  assert.equal(compilerAnyNodeBooleanFields.includes('resolved'), true)
})
