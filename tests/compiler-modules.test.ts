import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { collectExports as collectExportsFromFacade } from '../src/compiler/module-graph.ts'
import { collectExports, moduleId } from '../src/compiler/modules/exports.ts'
import { buildModuleGraph } from '../src/compiler/modules/graph.ts'
import { resolveExistingSource, resolveImport } from '../src/compiler/modules/resolve.ts'
import {
  createImportAliasDeclaration,
  insertImportSyntheticDeclarations
} from '../src/compiler/modules/synthetic-imports.ts'
import { isRuntimeBuiltinImportSource } from '../src/compiler/runtime-builtins.ts'
import type { AnyNode, ProgramNode } from '../src/compiler/types.ts'

test('classifies runtime builtin import sources from a shared helper', () => {
  assert.equal(isRuntimeBuiltinImportSource('node:fs'), true)
  assert.equal(isRuntimeBuiltinImportSource('node:fs/promises'), true)
  assert.equal(isRuntimeBuiltinImportSource('node:http'), true)
  assert.equal(isRuntimeBuiltinImportSource('node:path'), true)
  assert.equal(isRuntimeBuiltinImportSource('node:timers/promises'), true)
  assert.equal(isRuntimeBuiltinImportSource('./node:fs'), false)
})

test('collects module exports through split module helpers and facade', () => {
  const ast: ProgramNode = {
    type: 'Program',
    body: [
      { type: 'VariableDeclaration', kind: 'const', exported: true, name: 'value', init: null },
      { type: 'FunctionDeclaration', exported: true, name: 'main', params: [], body: [] },
      { type: 'TypeAliasDeclaration', exported: true, name: 'Shape', valueType: { kind: 'object', fields: [] } },
      { type: 'VariableDeclaration', kind: 'const', exported: false, name: 'hidden', init: null }
    ]
  }

  assert.deepEqual([...collectExports(ast).keys()], ['value', 'main', 'Shape'])
  assert.deepEqual([...collectExportsFromFacade(ast).keys()], ['value', 'main', 'Shape'])
  assert.equal(moduleId('/tmp/example.ts'), 'file:///tmp/example.ts')
})

test('inserts synthetic import declarations after matching imports', () => {
  const importDeclaration: AnyNode = { type: 'ImportDeclaration', source: './dep', specifiers: [] }
  const synthetic: AnyNode = { type: 'VariableDeclaration', kind: 'const', name: 'alias', init: null }
  const program: ProgramNode = {
    type: 'Program',
    body: [importDeclaration, { type: 'ExpressionStatement', expression: { type: 'Reference', path: ['alias'] } }]
  }

  assert.deepEqual(insertImportSyntheticDeclarations(program, new Map([[0, [synthetic]]])).body, [
    importDeclaration,
    synthetic,
    program.body[1]
  ])
})

test('creates function import aliases for renamed imports', () => {
  const alias = createImportAliasDeclaration(
    { imported: 'run', local: 'start' },
    {
      type: 'Program',
      body: [
        {
          type: 'FunctionDeclaration',
          exported: true,
          async: false,
          name: 'run',
          params: [{ name: 'value', valueType: 'number' }],
          returnType: 'number',
          body: []
        }
      ]
    }
  )

  assert.equal(alias?.type, 'FunctionDeclaration')
  assert.equal(alias?.name, 'start')
  assert.equal(alias?.body[0].type, 'ReturnStatement')
})

test('resolves module sources and builds module graphs through split entrypoint', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccjs-modules-'))

  try {
    const entry = join(dir, 'index.ts')
    const dep = join(dir, 'dep.ts')
    await writeFile(dep, 'export const answer: number = 42\n')
    await writeFile(
      entry,
      `import { answer as value } from './dep'

export function main(): void {
  console.log(value)
}
`
    )

    assert.equal(await resolveExistingSource(join(dir, 'dep')), dep)
    assert.equal(await resolveImport(entry, './dep'), dep)

    const graph = await buildModuleGraph(entry, { target: 'c' })

    assert.equal(graph.entry, entry)
    assert.deepEqual(
      graph.modules.map((module) => module.path),
      [dep, entry]
    )
    assert.ok(graph.modules.every((module) => module.hir != null && module.ir != null))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
