import { test } from 'node:test'
import assert from 'node:assert/strict'

import { collectGlobalUsages, collectIrGlobalRoots, collectIrGlobalUsages } from '../src/compiler/ir/globals.ts'
import {
  collectIrGlobalRoots as collectIrGlobalRootsFromFacade,
  collectIrGlobalUsages as collectIrGlobalUsagesFromFacade,
  lowerHirToIr
} from '../src/compiler/ir.ts'
import type { ProgramNode } from '../src/compiler/types.ts'

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
    { root: 'Date', path: ['Date', 'now'] }
  ]
  const programs = [
    { globalUsages },
    { globalUsages: [{ root: 'fetch', path: ['fetch'] }, { root: 'fs', path: ['fs', 'constants'] }] }
  ]

  assert.deepEqual(collectIrGlobalUsages(programs), [...globalUsages, ...programs[1].globalUsages])
  assert.deepEqual(collectIrGlobalUsagesFromFacade(programs), [...globalUsages, ...programs[1].globalUsages])
  assert.deepEqual(collectIrGlobalRoots(programs), ['Date', 'fetch', 'fs'])
  assert.deepEqual(collectIrGlobalRootsFromFacade(programs), ['Date', 'fetch', 'fs'])
})
