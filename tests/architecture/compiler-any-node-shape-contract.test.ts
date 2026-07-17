import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { compilerAnyNodeBooleanFields } from '../../compiler/c/values/any-node-fields.ts'
import { appendCompilerAnyNodeFallbackShapeFields } from '../../compiler/c/values/objects.ts'
import type { CObjectShapeField } from '../../compiler/c/types.ts'
import { anyNodeLikeDeclaredObjectFieldValueType } from '../../compiler/c/values/types.ts'
import { anyNodeObjectShape } from '../../compiler/checker/resolved-types.ts'

test('self-hosted AnyNode shape keeps nullable as an optional nullable boolean field', () => {
  const shape = anyNodeObjectShape({ file: 'test.ts', line: 1, column: 1 })
  const field = shape.fields.find((item) => item.name === 'nullable')

  assert.equal(field?.valueType, 'boolean')
  assert.equal(field?.optional, true)
  assert.equal(field?.nullable, true)
  assert.equal(compilerAnyNodeBooleanFields.includes('nullable'), true)
})

test('C AnyNode fallback refines an existing known field from unknown to its contract type', () => {
  const fields: CObjectShapeField[] = [
    {
      name: 'methods',
      optional: true,
      readonlyField: false,
      valueType: 'unknown'
    }
  ]

  appendCompilerAnyNodeFallbackShapeFields(fields)

  assert.equal(fields.find((field) => field.name === 'methods')?.valueType, 'array')
  assert.equal(anyNodeLikeDeclaredObjectFieldValueType('ClassExpressionNode', 'methods'), 'array')
})

test('self-hosted lowering keeps an explicit contract for dynamic array binding elements', () => {
  const typesSource = readFileSync(new URL('../../compiler/types.ts', import.meta.url), 'utf8')
  const loweringSource = readFileSync(new URL('../../compiler/lower/expressions.ts', import.meta.url), 'utf8')

  assert.match(typesSource, /export type ArrayBindingElement = \{[\s\S]*valueType\?: ValueType/)
  assert.match(
    loweringSource,
    /const bindingElements: ArrayBindingElement\[\] = param\.bindingElements \?\? \[\]/
  )
})
