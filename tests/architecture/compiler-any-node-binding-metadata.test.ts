import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  compilerAnyNodeBooleanFields,
  compilerAnyNodeObjectFields,
  compilerAnyNodeStringFields
} from '../../compiler/backends/cpp/values/any-node-fields.ts'
import { anyNodeObjectShape } from '../../compiler/checker/resolved-types.ts'

test('self-hosted AnyNode сохраняет metadata привязки ссылок и inline-деклараций', () => {
  const shape = anyNodeObjectShape({ file: 'test.ts', line: 1, column: 1 })
  const bindingKind = shape.fields.find((field) => field.name === 'bindingKind')
  const bindingLoc = shape.fields.find((field) => field.name === 'bindingLoc')
  const inline = shape.fields.find((field) => field.name === 'inline')
  const inlineLoc = shape.fields.find((field) => field.name === 'inlineLoc')

  assert.equal(bindingKind?.valueType, 'string')
  assert.equal(bindingKind?.nullable, true)
  assert.equal(bindingLoc?.valueType, 'object')
  assert.equal(bindingLoc?.shape?.fields?.some((field: { name?: string }) => field.name === 'file'), true)
  assert.equal(inline?.valueType, 'boolean')
  assert.equal(inlineLoc?.shape?.fields?.some((field: { name?: string }) => field.name === 'file'), true)
  assert.equal(compilerAnyNodeStringFields.includes('bindingKind'), true)
  assert.equal(compilerAnyNodeObjectFields.includes('bindingLoc'), true)
  assert.equal(compilerAnyNodeBooleanFields.includes('inline'), true)
  assert.equal(compilerAnyNodeObjectFields.includes('inlineLoc'), true)
})
