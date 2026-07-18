import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSourceToIr } from '../../compiler/core.ts'
import type { AnyNode } from '../../compiler/types.ts'
import { neutralAwaitableLibrarySet } from './helpers/compiler-awaitable-type-ref-fixtures.ts'

test('awaitable TypeRef определяет fulfilled type независимо от legacy metadata', () => {
  const libraries = neutralAwaitableLibrarySet()
  const result = compileSourceToIr(
    'const typed = await readTypedCompletion()\n' + 'const conflicted = await readConflictedCompletion()\n',
    { libraries }
  )
  const typed = result.ast.body[0].init
  const conflicted = result.ast.body[1].init
  const conflictedOperation = libraries.operations.find(
    (operation) => operation.operationId === 'fixture:awaitable#read-conflicted'
  )

  assert.equal(conflictedOperation?.promiseValueType, 'number')
  assertAwaitedString(typed)
  assertAwaitedString(conflicted)
})

function assertAwaitedString(expression: AnyNode): void {
  assert.equal(expression.type, 'AwaitExpression')
  assert.equal(expression.argument.valueType, 'promise')
  assert.equal(expression.argument.promiseValueType, 'string')
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
