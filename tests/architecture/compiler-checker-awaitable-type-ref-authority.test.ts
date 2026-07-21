import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSourceToIr } from '../../compiler/core.ts'
import type { AnyNode } from '../../compiler/types.ts'
import { neutralAwaitableLibrarySet } from './helpers/compiler-awaitable-type-ref-fixtures.ts'

test('awaitable TypeRef определяет fulfilled и rejected metadata', () => {
  const result = compileSourceToIr('const typed = await readTypedCompletion()\n', {
    libraries: neutralAwaitableLibrarySet()
  })
  const typed = result.ast.body[0].init

  assertAwaitedString(typed)
})

function assertAwaitedString(expression: AnyNode): void {
  assert.equal(expression.type, 'AwaitExpression')
  assert.equal(expression.argument.valueType, 'async-result')
  assert.equal(expression.argument.asyncResultValueType, 'string')
  assert.equal(expression.argument.asyncResultRejectionValueType, 'boolean')
  assert.equal(expression.argument.typeRef.kind, 'nominal')
  assert.equal(expression.argument.typeRef.typeId, 'fixture:awaitable#Completion')
  assert.equal(expression.valueType, 'string')
  assert.deepEqual(expression.typeRef, {
    kind: 'primitive',
    name: 'string',
    nullable: false,
    ownership: 'value',
    traits: []
  })
}
