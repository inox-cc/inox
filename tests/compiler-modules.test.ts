import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  collectExports as collectExportsFromFacade,
  createMemoryCompilerHost,
  createNodeCompilerHost
} from '../src/compiler/module-graph.ts'
import { collectExports, moduleId } from '../src/compiler/modules/exports.ts'
import { buildModuleGraph } from '../src/compiler/modules/graph.ts'
import { resolveExistingSource, resolveImport } from '../src/compiler/modules/resolve.ts'
import {
  compileFileToCModules,
  compileMemoryPackageToCModules,
  compileMemoryPackageToIrModules
} from '../src/compiler/index.ts'
import {
  createImportAliasDeclaration,
  insertImportSyntheticDeclarations
} from '../src/compiler/modules/synthetic-imports.ts'
import { isRuntimeBuiltinImportSource } from '../src/compiler/runtime-builtins.ts'
import type { AnyNode, ProgramNode } from '../src/compiler/types.ts'

const nodeCompilerHost = createNodeCompilerHost()

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
  assert.equal(moduleId('/tmp/example.ts', nodeCompilerHost), 'file:///tmp/example.ts')
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

test('creates import aliases only from exported declarations', () => {
  const alias = createImportAliasDeclaration(
    { imported: 'run', local: 'start' },
    {
      type: 'Program',
      body: [
        {
          type: 'FunctionDeclaration',
          exported: false,
          async: false,
          name: 'run',
          params: [],
          returnType: 'void',
          body: []
        },
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
  assert.equal(alias?.returnType, 'number')
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

    assert.equal(resolveExistingSource(join(dir, 'dep'), nodeCompilerHost), dep)
    assert.equal(resolveImport(entry, './dep', nodeCompilerHost), dep)
    assert.equal(await Promise.resolve(resolveExistingSource(join(dir, 'dep'), nodeCompilerHost)), dep)

    const graph = await buildModuleGraph(entry, { target: 'c', host: nodeCompilerHost })

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

test('builds module graphs through an in-memory compiler host', async () => {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/project/dep.ts',
        source: `export function answer(): number {
  return 42
}
`
      },
      {
        path: '/project/index.ts',
        source: `import { answer } from './dep'

export function main(): void {
  console.log(answer())
}
`
      }
    ],
    {}
  )

  const graph = await buildModuleGraph('/project/index.ts', {
    target: 'c',
    host
  })

  assert.equal(graph.entry, '/project/index.ts')
  assert.deepEqual(
    graph.modules.map((module) => module.path),
    ['/project/dep.ts', '/project/index.ts']
  )
  assert.ok(graph.modules.every((module) => module.hir != null && module.ir != null))
})

test('emits C module files through an in-memory compiler host', async () => {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/project/lib.ts',
        source: `export function greet(): void {
  console.log('hello')
}
`
      },
      {
        path: '/project/index.ts',
        source: `import { greet } from './lib'

export function main(): void {
  greet()
}
`
      }
    ],
    {}
  )

  const result = await compileFileToCModules('/project/index.ts', {
    host,
    sourceRoot: '/project',
    target: 'c'
  })

  assert.deepEqual(
    result.files.map((file) => file.path),
    ['lib.c', 'lib.h', 'index.c', 'index.h']
  )
  assert.match(result.files.find((file) => file.path === 'index.c')?.code ?? '', /#include "lib\.h"/)
})

test('emits imported exported constants as C module globals', async () => {
  const files = [
    {
      path: '/project/dep.ts',
      source: 'export const answer: number = 42\n'
    },
    {
      path: '/project/index.ts',
      source: `import { answer } from './dep'

export function main(): void {
  console.log(answer)
}
`
    }
  ]

  const result = await compileMemoryPackageToCModules('/project/index.ts', files, {
    sourceRoot: '/project',
    target: 'c'
  })
  const depHeader = result.files.find((file) => file.path === 'dep.h')?.code ?? ''
  const depSource = result.files.find((file) => file.path === 'dep.c')?.code ?? ''
  const indexSource = result.files.find((file) => file.path === 'index.c')?.code ?? ''

  assert.match(depHeader, /extern double ccjs_mod_dep_ts_[a-f0-9]+_answer;/)
  assert.match(depSource, /double ccjs_mod_dep_ts_[a-f0-9]+_answer = 0;/)
  assert.match(indexSource, /ccjs_mod_dep_ts_[a-f0-9]+_init\(\);/)
  assert.match(indexSource, /ccjs_mod_dep_ts_[a-f0-9]+_answer/)
})

test('compiles memory packages through self-hosting entrypoints', async () => {
  const files = [
    {
      path: '/project/math.ts',
      source: `export function value(): number {
  return 7
}
`
    },
    {
      path: '/project/index.ts',
      source: `import { value } from './math'

export function main(): void {
  console.log(value())
}
`
    }
  ]

  const ir = await compileMemoryPackageToIrModules('/project/index.ts', files, {
    target: 'c'
  })
  const modules = await compileMemoryPackageToCModules('/project/index.ts', files, {
    sourceRoot: '/project',
    target: 'c'
  })

  assert.deepEqual(
    ir.graph.modules.map((module) => module.path),
    ['/project/math.ts', '/project/index.ts']
  )
  assert.deepEqual(
    modules.files.map((file) => file.path),
    ['math.c', 'math.h', 'index.c', 'index.h']
  )
  assert.match(modules.files.find((file) => file.path === 'index.c')?.code ?? '', /#include "math\.h"/)
})
