import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compilerAnyNodeSyntaxChildFields } from '../../compiler/any-node-fields.ts'
import {
  compilerAnyNodeObjectFields,
  compilerAnyNodeUnknownFields
} from '../../compiler/backends/cpp/values/any-node-fields.ts'
import {
  anyNodeLikeDeclaredObjectFieldValueType,
  anyNodeLikeObjectFieldDeclaredType
} from '../../compiler/backends/cpp/values/types.ts'
import { anyNodeObjectShape } from '../../compiler/checker/resolved-types.ts'

test('AnyNode consequent stays generic across expression and switch case nodes', () => {
  const shape = anyNodeObjectShape({ file: 'test.ts', line: 1, column: 1 })
  const field = shape.fields.find((candidate) => candidate.name === 'consequent')

  assert.equal(field?.valueType, 'unknown')
  assert.equal(field?.declaredType, null)
  assert.equal(field?.nullable, false)
  assert.equal(compilerAnyNodeSyntaxChildFields.includes('consequent'), false)
  assert.equal(compilerAnyNodeObjectFields.includes('consequent'), false)
  assert.equal(compilerAnyNodeUnknownFields.includes('consequent'), true)
  assert.equal(anyNodeLikeDeclaredObjectFieldValueType('AnyNode', 'consequent'), 'unknown')
  assert.equal(anyNodeLikeObjectFieldDeclaredType('consequent'), null)
})
