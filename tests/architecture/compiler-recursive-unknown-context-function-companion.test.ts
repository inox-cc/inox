import assert from 'node:assert/strict'
import { test } from 'node:test'

import { isPlainFunctionPointerType } from '../../compiler/backends/cpp/async/callbacks.ts'
import type { CFunctionType } from '../../compiler/backends/cpp/types.ts'

test('recursive unresolved context preserves the established function companion ABI', () => {
  const functionType: CFunctionType = {
    kind: 'function',
    params: [
      {
        name: 'expression',
        valueType: 'object',
        declaredType: 'AsyncResultAstNode',
        shape: { fields: [] }
      },
      {
        name: 'context',
        valueType: 'unknown',
        declaredType: 'AsyncResultFunctionContext',
        shape: null
      }
    ],
    returnNullable: true,
    returnType: 'string'
  }

  assert.equal(isPlainFunctionPointerType(functionType), false)
  assert.equal(isPlainFunctionPointerType(functionType, ['AsyncResultFunctionContext']), true)
})
