import assert from 'node:assert/strict'
import { test } from 'node:test'

import { isPlainFunctionPointerType } from '../../compiler/c/async/callbacks.ts'
import type { CFunctionType } from '../../compiler/c/types.ts'

test('resolved recursive compiler context preserves the established function companion ABI', () => {
  const functionType: CFunctionType = {
    kind: 'function',
    params: [
      {
        name: 'expression',
        valueType: 'object',
        declaredType: 'StatementNode',
        shape: { fields: [] }
      },
      {
        name: 'context',
        valueType: 'object',
        declaredType: 'CFunctionContext',
        shape: { fields: [] }
      }
    ],
    returnNullable: true,
    returnType: 'string'
  }

  assert.equal(isPlainFunctionPointerType(functionType), false)
  assert.equal(isPlainFunctionPointerType(functionType, ['CEmitContext']), true)
})
