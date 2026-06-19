import assert from 'node:assert/strict'
import test from 'node:test'

import {
  emitRuntimeFieldValueCheck,
  emitRuntimeNullableValueCheck,
  emitRuntimeValueCheck
} from '../../compiler/c/runtime-values.ts'

function createContext() {
  return {
    cleanupEnabled: false,
    statusReturn: true,
    throwingFunction: false,
    usedCleanupGoto: false
  }
}

test('emits runtime value checks without empty filter callbacks', () => {
  const context = createContext()

  assert.equal(emitRuntimeValueCheck('value', null, context), '')
  assert.deepEqual(emitRuntimeFieldValueCheck('value', null, { nullable: false }, context), [])
  assert.deepEqual(emitRuntimeFieldValueCheck('value', 'INOX_TAG_NUMBER', { nullable: false }, context), [
    'if (value.tag != INOX_TAG_NUMBER) return INOX_ERR_TYPE;'
  ])
})

test('emits nullable runtime value checks', () => {
  const context = createContext()

  assert.deepEqual(emitRuntimeNullableValueCheck('value', 'INOX_TAG_STRING', context), [
    'if (value.tag != INOX_TAG_NULL && (value.tag != INOX_TAG_STRING || value.as.ref == 0)) return INOX_ERR_TYPE;'
  ])
})

test('marks custom failure statements as used', () => {
  const context = {
    cleanupEnabled: false,
    failureStatement: 'return INOX_ERR_CUSTOM;',
    failureStatementUsed: false,
    statusReturn: true,
    throwingFunction: false,
    usedCleanupGoto: false
  }

  assert.equal(
    emitRuntimeValueCheck('value', 'INOX_TAG_BOOL', context),
    'if (value.tag != INOX_TAG_BOOL) return INOX_ERR_CUSTOM;'
  )
  assert.equal(context.failureStatementUsed, true)
})
