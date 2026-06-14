import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  collectFunctionDeclarations,
  collectIrFunctionDeclarations,
  collectIrFunctionNodeEntries,
  collectIrModuleRecords,
  collectIrPrograms,
  collectIrTopLevelNodeEntries,
  collectIrTopLevelNodes,
  collectTopLevelItems,
  findIrEntryProgram
} from '../src/compiler/ir/top-level.ts'
import { collectIrTopLevelNodesFromPrograms } from '../src/compiler/ir.ts'
import type { AnyNode, IrProgram, ModuleGraph, ProgramNode } from '../src/compiler/types.ts'

function makeIr(body: AnyNode[]): IrProgram {
  const program: ProgramNode = {
    type: 'Program',
    body
  }
  const topLevelItems = collectTopLevelItems(program)

  return {
    type: 'IrProgram',
    version: 1,
    features: [],
    runtimeRequirements: [],
    topLevelItems,
    functionDeclarations: collectFunctionDeclarations(program, topLevelItems),
    functionEffects: [],
    syntaxFeatures: [],
    globalUsages: [],
    body
  }
}

test('collects IR top-level item metadata', () => {
  const body: AnyNode[] = [
    { type: 'ImportDeclaration', source: 'node:fs' },
    { type: 'FunctionDeclaration', name: 'main', exported: true, async: false, params: [], returnType: 'void' },
    { type: 'ClassDeclaration', name: 'Box' },
    { type: 'TypeAliasDeclaration', name: 'Name' },
    { type: 'ExpressionStatement', expression: { type: 'NumberLiteral', value: 1 } }
  ]
  const ir = makeIr(body)

  assert.deepEqual(
    ir.topLevelItems.map((item) => item.kind),
    ['import', 'function', 'class', 'type', 'statement']
  )
  assert.equal(collectIrTopLevelNodes(ir, 'function')[0], body[1])
  assert.equal(collectIrTopLevelNodeEntries(ir).length, 5)
  assert.equal(collectIrTopLevelNodesFromPrograms([ir], 'class')[0], body[2])
})

test('pairs IR function declarations with top-level nodes', () => {
  const ir = makeIr([
    { type: 'FunctionDeclaration', name: 'main', exported: true, async: false, params: [], returnType: 'void' },
    { type: 'FunctionDeclaration', name: 'helper', exported: false, async: true, params: [], returnType: 'number' }
  ])

  assert.deepEqual(
    collectIrFunctionDeclarations([ir]).map((item) => item.name),
    ['main', 'helper']
  )
  assert.deepEqual(
    collectIrFunctionNodeEntries([ir]).map((item) => [item.declaration.name, item.node.name]),
    [
      ['main', 'main'],
      ['helper', 'helper']
    ]
  )
})

test('collects IR module records from module graph', () => {
  const entryIr = makeIr([{ type: 'ExpressionStatement', expression: { type: 'NumberLiteral', value: 1 } }])
  const otherIr = makeIr([{ type: 'ExpressionStatement', expression: { type: 'NumberLiteral', value: 2 } }])
  const graph: ModuleGraph = {
    entry: '/entry.ts',
    modules: [
      { path: '/entry.ts', source: '', ast: { body: [] }, hir: null, ir: entryIr, imports: [], exports: new Map() },
      { path: '/ignored.ts', source: '', ast: { body: [] }, hir: null, ir: null, imports: [], exports: new Map() },
      { path: '/other.ts', source: '', ast: { body: [] }, hir: null, ir: otherIr, imports: [], exports: new Map() }
    ]
  }
  const records = collectIrModuleRecords(graph)

  assert.deepEqual(records.map((record) => record.path), ['/entry.ts', '/other.ts'])
  assert.deepEqual(collectIrPrograms(records), [entryIr, otherIr])
  assert.equal(findIrEntryProgram(records, '/entry.ts'), entryIr)
  assert.equal(findIrEntryProgram(records, '/missing.ts'), null)
})
