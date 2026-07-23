import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  compilerAnyNodeArrayFields,
  compilerAnyNodeBooleanFields
} from '../../compiler/backends/cpp/values/any-node-fields.ts'
import { anyNodeObjectShape } from '../../compiler/checker/resolved-types.ts'

test('self-hosted AnyNode сохраняет metadata импортированного class', () => {
  const shape = anyNodeObjectShape({ file: 'test.ts', line: 1, column: 1 })
  const constructable = shape.fields.find((field) => field.name === 'constructable')
  const constructorParams = shape.fields.find((field) => field.name === 'constructorParams')
  const classMethods = shape.fields.find((field) => field.name === 'classMethods')

  assert.equal(constructable?.valueType, 'boolean')
  assert.equal(constructorParams?.declaredType, 'array<AnyNode>')
  assert.equal(classMethods?.declaredType, 'array<AnyNode>')
  assert.equal(compilerAnyNodeBooleanFields.includes('constructable'), true)
  assert.equal(compilerAnyNodeArrayFields.includes('constructorParams'), true)
  assert.equal(compilerAnyNodeArrayFields.includes('classMethods'), true)
})
