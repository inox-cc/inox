import assert from 'node:assert/strict'
import test from 'node:test'

import {
  cRuntimeValueTag,
  emitCReturnType,
  emitCType,
  emitThrowingFunctionOutType,
  isManagedRuntimeReturnType,
  isOpaqueRuntimeValueType,
  isThrowingFunctionRuntimeOut
} from '../src/compiler/c/value-types.ts'
import { emitReturnValueDeclarations } from '../src/compiler/c/context.ts'

test('treats named non-special C value types as opaque runtime values', () => {
  const names = ['CFunctionContext', 'StatementLoweringDependencies', 'ArrayCallbackBody']

  for (let index = 0; index < names.length; index = index + 1) {
    const name = names[index]

    assert.equal(isOpaqueRuntimeValueType(name), true)
    assert.equal(isManagedRuntimeReturnType(name), false)
    assert.equal(emitCType(name), 'ccjs_value')
    assert.equal(emitCReturnType(name, false), 'ccjs_value')
    assert.equal(emitThrowingFunctionOutType(name, false), 'ccjs_value')
    assert.equal(cRuntimeValueTag(name), null)
  }

  assert.equal(
    isThrowingFunctionRuntimeOut({
      returnNullable: false,
      returnType: 'CFunctionContext'
    }),
    true
  )
  assert.deepEqual(
    emitReturnValueDeclarations({
      returnNullable: false,
      returnType: 'CFunctionContext'
    } as never),
    ['ccjs_value ccjs_return = ccjs_undefined_value();']
  )
})

test('keeps concrete runtime, scalar and special C value types non-opaque', () => {
  const nonOpaque = [
    null,
    undefined,
    'unknown',
    'void',
    'number',
    'boolean',
    'string',
    'bytes',
    'object',
    'array',
    'map',
    'set',
    'function',
    'promise',
    'timer',
    'crypto-hash',
    'crypto-hmac',
    'optional',
    'js-global'
  ]

  for (let index = 0; index < nonOpaque.length; index = index + 1) {
    assert.equal(isOpaqueRuntimeValueType(nonOpaque[index]), false)
  }
})
