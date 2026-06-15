import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, posix } from 'node:path'

import {
  collectExports as collectExportsFromFacade,
  createNodeCompilerHost
} from '../src/compiler/module-graph.ts'
import { collectExports, moduleId } from '../src/compiler/modules/exports.ts'
import { buildModuleGraph } from '../src/compiler/modules/graph.ts'
import { resolveExistingSource, resolveImport } from '../src/compiler/modules/resolve.ts'
import { compileFileToCModules } from '../src/compiler/index.ts'
import {
  createImportAliasDeclaration,
  insertImportSyntheticDeclarations
} from '../src/compiler/modules/synthetic-imports.ts'
import { isRuntimeBuiltinImportSource } from '../src/compiler/runtime-builtins.ts'
import type { AnyNode, ProgramNode } from '../src/compiler/types.ts'
import type { CompilerHost } from '../src/compiler/module-graph.ts'

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

    assert.equal(await resolveExistingSource(join(dir, 'dep'), nodeCompilerHost), dep)
    assert.equal(await resolveImport(entry, './dep', nodeCompilerHost), dep)

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
    new Map([
      [
        '/project/dep.ts',
        `export function answer(): number {
  return 42
}
`
      ],
      [
        '/project/index.ts',
        `import { answer } from './dep'

export function main(): void {
  console.log(answer())
}
`
      ]
    ])
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
    new Map([
      [
        '/project/lib.ts',
        `export function greet(): void {
  console.log('hello')
}
`
      ],
      [
        '/project/index.ts',
        `import { greet } from './lib'

export function main(): void {
  greet()
}
`
      ]
    ])
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

function createMemoryCompilerHost(files: Map<string, string>): CompilerHost {
  return {
    pathSeparator: '/',
    posixPath: {
      basename: posix.basename,
      dirname: posix.dirname,
      extname: posix.extname,
      relative: posix.relative
    },
    dirname: posix.dirname,
    extname: posix.extname,
    isAbsolutePath: posix.isAbsolute,
    joinPath: posix.join,
    normalizePath: posix.normalize,
    pathToFileUrl(path: string): string {
      return `file://${path}`
    },
    async readFile(path: string): Promise<string> {
      const source = files.get(posix.normalize(path))

      if (source == null) {
        throw new Error(`missing memory file ${path}`)
      }

      return source
    },
    relativePath: posix.relative,
    resolvePath(path: string): string {
      return posix.normalize(posix.isAbsolute(path) ? path : posix.resolve('/project', path))
    },
    shortHash(value: string): string {
      let hash = 0

      for (let index = 0; index < value.length; index += 1) {
        hash = (hash * 31 + value.charCodeAt(index)) >>> 0
      }

      return hash.toString(16).padStart(8, '0').slice(0, 8)
    }
  }
}
