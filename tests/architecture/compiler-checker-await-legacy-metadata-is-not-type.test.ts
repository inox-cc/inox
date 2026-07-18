import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSourceToIr } from '../../compiler/core.ts'
import { neutralAwaitableLibrarySet } from './helpers/compiler-awaitable-type-ref-fixtures.ts'

test('legacy promiseValueType без awaitable trait не типизирует await', () => {
  const result = compileSourceToIr('const value = await readLegacyCompletion()\n', {
    libraries: neutralAwaitableLibrarySet()
  })
  const awaited = result.ast.body[0].init

  assert.equal(awaited.argument.valueType, 'promise')
  assert.equal(awaited.argument.promiseValueType, 'number')
  assert.equal(awaited.argument.typeRef ?? null, null)
  assert.equal(awaited.valueType, 'promise')
  assert.equal(awaited.typeRef ?? null, null)
})
