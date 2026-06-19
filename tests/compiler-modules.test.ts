import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  collectExports as collectExportsFromFacade,
  createMemoryCompilerHost,
  createNodeCompilerHost
} from '../compiler/module-graph.ts'
import { collectExports, moduleId } from '../compiler/modules/exports.ts'
import { buildModuleGraph } from '../compiler/modules/graph.ts'
import { resolveExistingSource, resolveImport } from '../compiler/modules/resolve.ts'
import {
  compileFileToCModules,
  compileMemoryPackageToCModules,
  compileMemoryPackageToIrModules
} from '../compiler/index.ts'
import {
  createImportAliasDeclaration,
  insertImportSyntheticDeclarations
} from '../compiler/modules/synthetic-imports.ts'
import { isRuntimeBuiltinImportSource } from '../compiler/runtime-builtins.ts'
import type { AnyNode, ProgramNode } from '../compiler/types.ts'

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

test('preserves re-exported function return shapes for string member length', async () => {
  const files = [
    {
      path: '/project/core.ts',
      source: `export type SourceCompileResult = {
  code: string
}

export function compileSource(): SourceCompileResult {
  return { code: 'hello' }
}
`
    },
    {
      path: '/project/facade.ts',
      source: `export { compileSource } from './core'
`
    },
    {
      path: '/project/index.ts',
      source: `import { compileSource } from './facade'

export function main(): void {
  const result = compileSource()
  console.log(result.code.length)
}
`
    }
  ]

  const modules = await compileMemoryPackageToCModules('/project/index.ts', files, {
    sourceRoot: '/project',
    target: 'c'
  })
  const indexSource = modules.files.find((file) => file.path === 'index.c')?.code ?? ''

  assert.match(indexSource, /inox_string_code_unit_length_parts/)
  assert.doesNotMatch(indexSource, /inox_array_len/)
})

test('resolves module sources and builds module graphs through split entrypoint', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'inox-modules-'))

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
    assert.ok(graph.modules.every((module) => module.hir && module.ir))
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
  assert.ok(graph.modules.every((module) => module.hir && module.ir))
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

  assert.match(depHeader, /extern double inox_mod_dep_ts_[a-f0-9]+_answer;/)
  assert.match(depSource, /double inox_mod_dep_ts_[a-f0-9]+_answer = 0;/)
  assert.match(indexSource, /inox_mod_dep_ts_[a-f0-9]+_init\(\);/)
  assert.match(indexSource, /inox_mod_dep_ts_[a-f0-9]+_answer/)
})

test('returns module-scope object constants through C module globals', async () => {
  const files = [
    {
      path: '/project/index.ts',
      source: `type Item = {
  kind: string
}

const fallback: Item = { kind: 'fallback' }

export function read(): Item {
  return fallback
}
`
    }
  ]

  const modules = await compileMemoryPackageToCModules('/project/index.ts', files, {
    sourceRoot: '/project',
    target: 'c'
  })
  const source = modules.files.find((file) => file.path === 'index.c')?.code ?? ''

  assert.match(source, /static inox_value inox_mod_index_ts_[a-f0-9]+_fallback;/)
  assert.match(source, /inox_return = inox_mod_index_ts_[a-f0-9]+_fallback;/)
  assert.doesNotMatch(source, /inox_return = fallback;/)
})

test('preserves createFunctionContext companion aliases for typed locals', async () => {
  const files = [
    {
      path: '/project/dep.ts',
      source: `type Dep = { run: () => string }
type Context = { dep: Dep }

export function createFunctionContext(baseContext: Context): Context {
  return baseContext
}
`
    },
    {
      path: '/project/index.ts',
      source: `import { createFunctionContext } from './dep'

type Dep = { run: () => string }
type Context = { dep: Dep }

function read(): string {
  return 'ok'
}

function take(context: Context): string {
  return context.dep.run()
}

export function main(): void {
  const baseContext: Context = { dep: { run: read } }
  const context: Context = createFunctionContext(baseContext)
  console.log(take(context))
}
`
    }
  ]

  const modules = await compileMemoryPackageToCModules('/project/index.ts', files, {
    sourceRoot: '/project',
    target: 'c'
  })
  const source = modules.files.find((file) => file.path === 'index.c')?.code ?? ''

  assert.match(source, /take\(context, inox_objfn_baseContext_dep_run\)/)
  assert.doesNotMatch(source, /take\(context, inox_objfn_context_dep_run\)/)
})

test('emits C module wrappers for re-exported functions', async () => {
  const files = [
    {
      path: '/project/dep.ts',
      source: `export function value(): number {
  return 7
}
`
    },
    {
      path: '/project/barrel.ts',
      source: `export { value } from './dep'
`
    },
    {
      path: '/project/index.ts',
      source: `import { value } from './barrel'

export function main(): void {
  console.log(value())
}
`
    }
  ]

  const modules = await compileMemoryPackageToCModules('/project/index.ts', files, {
    sourceRoot: '/project',
    target: 'c'
  })
  const barrelHeader = modules.files.find((file) => file.path === 'barrel.h')?.code ?? ''
  const barrelSource = modules.files.find((file) => file.path === 'barrel.c')?.code ?? ''
  const indexSource = modules.files.find((file) => file.path === 'index.c')?.code ?? ''

  assert.match(barrelHeader, /double inox_mod_barrel_ts_[a-f0-9]+_value\(void\);/)
  assert.match(barrelSource, /double inox_mod_barrel_ts_[a-f0-9]+_value\(void\) \{/)
  assert.match(barrelSource, /inox_return = inox_mod_dep_ts_[a-f0-9]+_value\(\);/)
  assert.match(indexSource, /inox_mod_barrel_ts_[a-f0-9]+_value\(\)/)
  assert.doesNotMatch(barrelSource, /inox_return = inox_mod_barrel_ts_[a-f0-9]+_value\(\);/)
})

test('keeps local exported function names when an import uses the same imported name', async () => {
  const files = [
    {
      path: '/project/dep.ts',
      source: `export function build(value: number, extra: number): number {
  return value + extra
}
`
    },
    {
      path: '/project/index.ts',
      source: `import { build as buildWithExtra } from './dep'

export function build(value: number): number {
  return buildWithExtra(value, 1)
}
`
    }
  ]

  const modules = await compileMemoryPackageToCModules('/project/index.ts', files, {
    sourceRoot: '/project',
    target: 'c'
  })
  const header = modules.files.find((file) => file.path === 'index.h')?.code ?? ''
  const source = modules.files.find((file) => file.path === 'index.c')?.code ?? ''

  assert.match(header, /double inox_mod_index_ts_[a-f0-9]+_build\(double value\);/)
  assert.doesNotMatch(header, /double inox_mod_dep_ts_[a-f0-9]+_build\(double value\);/)
  assert.match(source, /inox_return = inox_mod_dep_ts_[a-f0-9]+_build\(value, 1\);/)
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
    /inox_status inox_mod_worker_ts_[a-f0-9]+_read\(inox_value\* inox_out, inox_value\* inox_error_out\);/
  )
  assert.match(
    workerSource,
    /static inox_status inox_method_TicketWorker_read\(inox_value this, inox_value\* inox_out, inox_value\* inox_error_out\);/
  )
  assert.match(
    workerSource,
    /inox_status inox_method_status_\d+ = inox_method_TicketWorker_read\(worker, &inox_method_result_\d+, &inox_error\);/
  )
  assert.match(
    indexSource,
    /inox_status inox_call_status_\d+ = inox_mod_worker_ts_[a-f0-9]+_read\(&inox_call_result_\d+, &inox_error\);/
  )
  assert.doesNotMatch(indexSource, /inox_value_\d+ = inox_mod_worker_ts_[a-f0-9]+_read\(\);/)
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

  assert.match(source, /static inox_value inox_mod_index_ts_[a-f0-9]+_base;/)
  assert.match(source, /static inox_value inox_mod_index_ts_[a-f0-9]+_deps;/)
  assert.match(source, /static double inox_callback_arrow_0\(void\)/)
  assert.match(source, /inox_mod_index_ts_[a-f0-9]+_base/)
  assert.match(source, /inox_objfn_deps_read/)
})
