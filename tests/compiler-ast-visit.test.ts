import assert from 'node:assert/strict'
import test from 'node:test'
import { visitAstLike } from '../src/compiler/ast-visit.ts'

test('visits AST-like objects before their children', () => {
  const seen: string[] = []

  visitAstLike(
    {
      type: 'Root',
      child: {
        type: 'Child'
      },
      siblings: [
        {
          type: 'Sibling'
        }
      ]
    },
    (node) => {
      if (typeof node.type === 'string') {
        seen.push(node.type)
      }
    }
  )

  assert.deepEqual(seen, ['Root', 'Child', 'Sibling'])
})

test('skips default metadata keys while traversing', () => {
  const root: Record<string, unknown> = {
    type: 'Root',
    loc: {
      type: 'Location'
    },
    shape: {
      type: 'Shape'
    },
    child: {
      type: 'Child'
    }
  }

  root.parent = root

  const seen: string[] = []
  visitAstLike(root, (node) => {
    if (typeof node.type === 'string') {
      seen.push(node.type)
    }
  })

  assert.deepEqual(seen, ['Root', 'Child'])
})
