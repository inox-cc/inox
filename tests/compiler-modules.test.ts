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

test('lowers imported class method throws through C module status ABI', async () => {
  const files = [
    {
      path: '/project/worker.ts',
      source: `class TicketError {
  name: string
  message: string

  constructor(message: string) {
    this.name = 'TicketError'
    this.message = message
  }
}

class TicketWorker {
  read(): string {
    throw new TicketError('empty')
  }
}

export function read(): string {
  const worker = new TicketWorker()
  return worker.read()
}
`
    },
    {
      path: '/project/index.ts',
      source: `import { read } from './worker'

export function main(): void {
  try {
    console.log(read())
  } catch (error) {
    console.log(error)
  }
}
`
    }
  ]

  const modules = await compileMemoryPackageToCModules('/project/index.ts', files, {
    sourceRoot: '/project',
    target: 'c'
  })
  const workerHeader = modules.files.find((file) => file.path === 'worker.h')?.code ?? ''
  const workerSource = modules.files.find((file) => file.path === 'worker.c')?.code ?? ''
  const indexSource = modules.files.find((file) => file.path === 'index.c')?.code ?? ''

  assert.match(
    workerHeader,
    /ccjs_status ccjs_mod_worker_ts_[a-f0-9]+_read\(ccjs_value\* ccjs_out, ccjs_value\* ccjs_error_out\);/
  )
  assert.match(
    workerSource,
    /static ccjs_status ccjs_method_TicketWorker_read\(ccjs_value this, ccjs_value\* ccjs_out, ccjs_value\* ccjs_error_out\);/
  )
  assert.match(
    workerSource,
    /ccjs_status ccjs_method_status_\d+ = ccjs_method_TicketWorker_read\(worker, &ccjs_method_result_\d+, &ccjs_error\);/
  )
  assert.match(
    indexSource,
    /ccjs_status ccjs_call_status_\d+ = ccjs_mod_worker_ts_[a-f0-9]+_read\(&ccjs_call_result_\d+, &ccjs_error\);/
  )
  assert.doesNotMatch(indexSource, /ccjs_value_\d+ = ccjs_mod_worker_ts_[a-f0-9]+_read\(\);/)
})

test('lowers module-scope captures in object function field arrows', async () => {
  const files = [
    {
      path: '/project/index.ts',
      source: `type Base = {
  value: number
}

type Deps = {
  read: () => number
}

const base: Base = { value: 7 }
const deps: Deps = {
  read: () => base.value
}

export function main(): void {
  console.log(deps.read())
}
`
    }
  ]

  const modules = await compileMemoryPackageToCModules('/project/index.ts', files, {
    sourceRoot: '/project',
    target: 'c'
  })
  const source = modules.files.find((file) => file.path === 'index.c')?.code ?? ''

  assert.match(source, /static ccjs_value ccjs_mod_index_ts_[a-f0-9]+_base;/)
  assert.match(source, /static ccjs_value ccjs_mod_index_ts_[a-f0-9]+_deps;/)
  assert.match(source, /static double ccjs_callback_arrow_0\(void\)/)
  assert.match(source, /ccjs_mod_index_ts_[a-f0-9]+_base/)
  assert.match(source, /ccjs_objfn_deps_read/)
})
