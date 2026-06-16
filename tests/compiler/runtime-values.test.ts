import assert from 'node:assert/strict'
import test from 'node:test'

import { emitRuntimeFieldValueCheck, emitRuntimeNullableValueCheck, emitRuntimeValueCheck } from '../../src/compiler/c/runtime-values.ts'

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
  assert.deepEqual(emitRuntimeFieldValueCheck('value', 'CCJS_TAG_NUMBER', { nullable: false }, context), [
    'if (value.tag != CCJS_TAG_NUMBER) return CCJS_ERR_TYPE;'
  ])
})

test('emits nullable runtime value checks', () => {
  const context = createContext()

  assert.deepEqual(emitRuntimeNullableValueCheck('value', 'CCJS_TAG_STRING', context), [
    'if (value.tag != CCJS_TAG_NULL && (value.tag != CCJS_TAG_STRING || value.as.ref == 0)) return CCJS_ERR_TYPE;'
  ])
})

test('marks custom failure statements as used', () => {
  const context = {
    cleanupEnabled: false,
    failureStatement: 'return CCJS_ERR_CUSTOM;',
    failureStatementUsed: false,
    statusReturn: true,
    throwingFunction: false,
    usedCleanupGoto: false
  }

  assert.equal(emitRuntimeValueCheck('value', 'CCJS_TAG_BOOL', context), 'if (value.tag != CCJS_TAG_BOOL) return CCJS_ERR_CUSTOM;')
  assert.equal(context.failureStatementUsed, true)
})
