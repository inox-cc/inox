import assert from 'node:assert/strict'
import { test } from 'node:test'

import { containsAwaitExpression } from '../compiler/c/syntax.ts'
import { compileSource } from '../compiler/core.ts'
import type { AnyNode } from '../compiler/types.ts'

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

  assert.match(result.code, /inox_array_len/)
  assert.match(result.code, /inox_array_get/)
})

test('compiles typed object shape field lookup through helper result', () => {
  const result = compileSource(
    `type ShapeField = {
  name: string
  valueType: string
  arrayElementType?: string | null
  mapKeyType?: string | null
  mapValueType?: string | null
  setElementType?: string | null
}

function shapeFieldAt(fields: ShapeField[], expectedIndex: number): ShapeField | null {
  for (let index = 0; index < fields.length; index = index + 1) {
    if (index === expectedIndex) {
      return fields[index]
    }
  }

  return null
}

function valueTypeAt(fields: ShapeField[], expectedIndex: number): string {
  const field = shapeFieldAt(fields, expectedIndex)

  if (field == null) {
    return 'unknown'
  }

  return field.valueType
}

export function main(): void {
  console.log(valueTypeAt([{ name: 'score', valueType: 'number' }], 0))
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_array_get/)
  assert.match(result.code, /inox_object_get_known/)
})
