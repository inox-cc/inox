import { test } from 'node:test'
import assert from 'node:assert/strict'

import { compileSource } from '../src/compiler/core.ts'
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

test('compiles typed recursive syntax list traversal with C for-of', () => {
  const result = compileSource(
    `type SyntaxNode = {
  type?: string | null
  body?: any
  expression?: any
}

function hasAwait(node: SyntaxNode | SyntaxNode[] | null | undefined): boolean {
  if (node == null) {
    return false
  }

  if (Array.isArray(node)) {
    return hasAwaitList(node)
  }

  if (node.type === 'AwaitExpression') {
    return true
  }

  return hasAwait(node.body) || hasAwait(node.expression)
}

function hasAwaitList(nodes: SyntaxNode[]): boolean {
  for (const item of nodes) {
    if (hasAwait(item)) {
      return true
    }
  }

  return false
}

export function main(): void {
  console.log(hasAwait([{ type: 'ExpressionStatement', expression: { type: 'AwaitExpression' } }]))
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_array_len/)
  assert.match(result.code, /ccjs_array_get/)
})
