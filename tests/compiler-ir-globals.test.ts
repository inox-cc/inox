import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  collectIrGlobalRoots as collectIrGlobalRootsFromFacade,
  collectIrGlobalUsages as collectIrGlobalUsagesFromFacade,
  lowerHirToIr
} from '../compiler/ir.ts'
import { collectGlobalUsages, collectIrGlobalRoots, collectIrGlobalUsages } from '../compiler/ir/globals.ts'
import type { ProgramNode } from '../compiler/types.ts'

test('collects IR global usages from references and member paths', () => {
  const program: ProgramNode = {
    type: 'Program',
    body: [
      {
        type: 'CallExpression',
        fsRuntimeMethod: 'readFile',
        args: [{ type: 'Reference', path: ['Buffer'] }]
      },
      {
        type: 'MemberExpression',
        object: { type: 'Reference', path: ['Date'] },
        property: 'now'
      },
      {
        type: 'MemberExpression',
        object: {
          type: 'MemberExpression',
          object: {
            type: 'MemberExpression',
            object: { type: 'Reference', path: ['inox'] },
            property: '__debug'
          },
          property: 'memory'
        },
        property: 'call'
      },
      {
        type: 'IndexExpression',
        object: {
          type: 'MemberExpression',
          object: { type: 'Reference', path: ['fs'] },
          property: 'constants'
        },
        index: { type: 'StringLiteral', value: 'O_RDONLY' }
      },
      {
        type: 'Reference',
        path: ['fetch']
      }
    ]
  }
  const paths = collectGlobalUsages(program).map((usage) => usage.path)

  assert.deepEqual(paths, [
    ['fs', 'promises', 'readFile'],
    ['Buffer'],
    ['Date', 'now'],
    ['inox', '__debug', 'memory', 'call'],
    ['fs', 'constants'],
    ['fetch']
  ])
  assert.deepEqual(
    lowerHirToIr(program).globalUsages.map((usage) => usage.path),
    paths
  )
})

test('aggregates IR global usages and roots', () => {
  const globalUsages = [
    { root: 'fs', path: ['fs', 'promises', 'readFile'] },
    { root: 'Date', path: ['Date', 'now'] },
    { root: 'inox', path: ['inox', '__debug', 'memory'] }
  ]
  const programs = [
    { globalUsages },
    {
      globalUsages: [
        { root: 'fetch', path: ['fetch'] },
        { root: 'fs', path: ['fs', 'constants'] }
      ]
    }
  ]

  assert.deepEqual(collectIrGlobalUsages(programs), [...globalUsages, ...programs[1].globalUsages])
  assert.deepEqual(collectIrGlobalUsagesFromFacade(programs), [...globalUsages, ...programs[1].globalUsages])
  assert.deepEqual(collectIrGlobalRoots(programs), ['Date', 'fetch', 'fs', 'inox'])
  assert.deepEqual(collectIrGlobalRootsFromFacade(programs), ['Date', 'fetch', 'fs', 'inox'])
})
