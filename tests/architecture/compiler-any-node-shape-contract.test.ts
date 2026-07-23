import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { compilerAnyNodeSyntaxChildFields } from '../../compiler/any-node-fields.ts'
import {
  compilerAnyNodeArrayFields,
  compilerAnyNodeBooleanFields,
  compilerAnyNodeObjectFields,
  compilerAnyNodeStringArrayFields,
  compilerAnyNodeStringFields,
  compilerAnyNodeUnknownFields
} from '../../compiler/backends/cpp/values/any-node-fields.ts'
import { appendCompilerAnyNodeFallbackShapeFields } from '../../compiler/backends/cpp/values/objects.ts'
import type { CObjectShapeField } from '../../compiler/backends/cpp/types.ts'
import { anyNodeLikeDeclaredObjectFieldValueType } from '../../compiler/backends/cpp/values/types.ts'
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

  assert.equal(fields.find((field) => field.name === 'methods')?.valueType, 'object')
  assert.equal(anyNodeLikeDeclaredObjectFieldValueType('ClassExpressionNode', 'methods'), 'object')
})

test('self-hosted lowering keeps an explicit contract for dynamic array binding elements', () => {
  const typesSource = readFileSync(new URL('../../compiler/types.ts', import.meta.url), 'utf8')
  const loweringSource = readFileSync(new URL('../../compiler/lower/expressions.ts', import.meta.url), 'utf8')

  assert.match(typesSource, /export type ArrayBindingElement = \{[\s\S]*valueType\?: ValueType/)
  assert.match(loweringSource, /lowerArrayBindingElementsOrEmpty\(param\.bindingElements\)/)
})

test('self-hosted AnyNode shape preserves function overload arrays', () => {
  const shape = anyNodeObjectShape({ file: 'test.ts', line: 1, column: 1 })
  const field = shape.fields.find((item) => item.name === 'functionOverloads')

  assert.equal(field?.declaredType, 'array<AnyNode>')
  assert.equal(field?.nullable, true)
  assert.equal(compilerAnyNodeArrayFields.includes('functionOverloads'), true)
  assert.equal(compilerAnyNodeObjectFields.includes('functionOverloads'), false)
})

test('checker and C++ fallback agree on every AnyNode array field', () => {
  const shape = anyNodeObjectShape({ file: 'test.ts', line: 1, column: 1 })

  for (const name of compilerAnyNodeArrayFields) {
    const fields = shape.fields.filter((field) => field.name === name)
    const expectedElementType = compilerAnyNodeStringArrayFields.includes(name) ? 'string' : 'AnyNode'

    assert.equal(fields.length, 1, `${name} must have exactly one checker shape field`)
    assert.equal(fields[0]?.declaredType, `array<${expectedElementType}>`, `${name} element type`)
  }
})

test('checker and C++ fallback agree on every AnyNode field name', () => {
  const shape = anyNodeObjectShape({ file: 'test.ts', line: 1, column: 1 })
  const names = [
    ...compilerAnyNodeStringFields,
    ...compilerAnyNodeBooleanFields,
    ...compilerAnyNodeArrayFields,
    ...compilerAnyNodeObjectFields,
    ...compilerAnyNodeUnknownFields
  ]

  for (const name of names) {
    assert.equal(
      shape.fields.filter((field) => field.name === name).length,
      1,
      `${name} must have exactly one checker shape field`
    )
  }
})

test('checker and C++ fallback share syntax child fields and placeholder metadata', () => {
  const shape = anyNodeObjectShape({ file: 'test.ts', line: 1, column: 1 })
  const syntaxFields = ['test', 'alternate', 'finalizer']

  for (const name of syntaxFields) {
    const field = shape.fields.find((item) => item.name === name)

    assert.equal(compilerAnyNodeSyntaxChildFields.includes(name), true)
    assert.equal(compilerAnyNodeObjectFields.includes(name), true)
    assert.equal(compilerAnyNodeObjectFields.filter((item) => item === name).length, 1)
    assert.equal(field?.valueType, 'object')
    assert.equal(field?.declaredType, 'AnyNode')
    assert.equal(field?.nullable, true)
  }

  const placeholder = shape.fields.find((item) => item.name === 'templatePlaceholder')

  assert.equal(compilerAnyNodeBooleanFields.includes('templatePlaceholder'), true)
  assert.equal(placeholder?.valueType, 'boolean')
  assert.equal(placeholder?.nullable, true)
})
