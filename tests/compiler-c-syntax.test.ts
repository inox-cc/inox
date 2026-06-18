import { test } from 'node:test'
import assert from 'node:assert/strict'

import { containsAwaitExpression } from '../src/compiler/c/syntax.ts'
import type { AnyNode } from '../src/compiler/types.ts'

test('detects await expressions inside syntax node arrays', () => {
  const nodes: AnyNode[] = [
    {
      type: 'ExpressionStatement',
      expression: { type: 'NumberLiteral', value: 1 }
    },
    {
      type: 'BlockStatement',
      body: [
        {
          type: 'ExpressionStatement',
          expression: {
            type: 'AwaitExpression',
            argument: { type: 'Reference', path: ['work'] }
          }
        }
      ]
    }
  ]

  assert.equal(containsAwaitExpression(nodes), true)
  assert.equal(containsAwaitExpression(nodes[0]), false)
})
