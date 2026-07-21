import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSourceToIr } from '../../compiler/core.ts'
import { neutralAwaitableLibrarySet } from './helpers/compiler-awaitable-type-ref-fixtures.ts'

test('nominal TypeRef без awaitable trait не разворачивается оператором await', () => {
  const result = compileSourceToIr('const value = await readUnawaitableCompletion()\n', {
    libraries: neutralAwaitableLibrarySet()
  })
  const awaited = result.ast.body[0].init

  assert.equal(awaited.argument.valueType, 'async-result')
  assert.equal(awaited.argument.asyncResultValueType, null)
  assert.equal(awaited.argument.asyncResultRejectionValueType, null)
  assert.equal(awaited.argument.typeRef.kind, 'nominal')
  assert.equal(awaited.argument.typeRef.typeId, 'fixture:awaitable#Completion')
  assert.deepEqual(awaited.argument.typeRef.traits, [])
  assert.equal(awaited.valueType, 'async-result')
  assert.equal(awaited.typeRef ?? null, null)
})
