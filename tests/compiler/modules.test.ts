import test from 'node:test'
import {
  assert,
  assertDiagnostic,
  cLibuvOptions,
  collectIrFeatureRequirements,
  collectIrFunctionEffects,
  collectIrFunctionNodeEntries,
  collectIrGlobalRoots,
  collectIrLocalThrowValueTypes,
  collectIrModuleRecords,
  collectIrPrograms,
  collectIrTopLevelNodeEntries,
  collectIrTopLevelNodesFromPrograms,
  compileFile,
  compileSource,
  CompileError,
  emitCBundleFromIrModules,
  emitCFromIr,
  findIrEntryProgram,
  join,
  mkdir,
  mkdtemp,
  rm,
  tmpdir,
  writeFile
} from '../helpers/compiler-smoke.ts'



test('module graph stores HIR and IR per module', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccjs-modules-'))

  try {
    await writeFile(
      join(dir, 'lib.js'),
      `export function greet(): void {
  console.log('from lib')
}
`
    )
    await writeFile(
      join(dir, 'main.js'),
      `import { greet } from './lib.js'

export function main(): void {
  greet()
}
`
    )

    const result = await compileFile(join(dir, 'main.js'), {
      target: 'c'
    })

    assert.equal(
      result.graph.modules.every((module) => module.hir?.type === 'HirProgram'),
      true
    )
    assert.equal(
      result.graph.modules.every((module) => module.ir?.type === 'IrProgram'),
      true
    )
    assert.equal(
      result.graph.modules.every((module) => Array.isArray(module.ir?.topLevelItems)),
      true
    )
    assert.equal(
      result.graph.modules.every((module) => Array.isArray(module.ir?.functionDeclarations)),
      true
    )
    assert.equal(
      result.graph.modules.every((module) => Array.isArray(module.ir?.syntaxFeatures)),
      true
    )
    assert.equal(
      result.graph.modules.every((module) => Array.isArray(module.ir?.globalUsages)),
      true
    )
    assert.equal(
      result.graph.modules.every((module) => Array.isArray(module.ir?.functionEffects)),
      true
    )
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('module graph resolves named re-exports', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccjs-reexports-'))

  try {
    await writeFile(
      join(dir, 'lib.js'),
      `export function greet(): void {
  console.log('from lib')
}
`
    )
    await writeFile(
      join(dir, 'barrel.js'),
      `export { greet } from './lib.js'
`
    )
    await writeFile(
      join(dir, 'main.js'),
      `import { greet } from './barrel.js'

export function main(): void {
  greet()
}
`
    )

    const result = await compileFile(join(dir, 'main.js'), {
      target: 'c'
    })

    assert.equal(result.graph.modules.some((module) => module.path.endsWith('barrel.js')), true)
    assert.match(result.code, /from lib/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})


test('collects target-neutral IR module records from stored IR without HIR', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccjs-ir-module-records-'))

  try {
    await writeFile(
      join(dir, 'lib.ts'),
      `export function greet(): void {
  console.log('from lib')
}
`
    )
    await writeFile(
      join(dir, 'main.ts'),
      `import { greet } from './lib.ts'

export function main(): void {
  greet()
}
`
    )

    const result = await compileFile(join(dir, 'main.ts'), {
      target: 'c'
    })
    const graph = {
      ...result.graph,
      modules: result.graph.modules.map((module) => ({
        ...module,
        hir: null
      }))
    }
    const irModules = collectIrModuleRecords(graph)

    assert.equal(irModules.length, result.graph.modules.length)
    assert.deepEqual(
      irModules.map((module) => module.path),
      result.graph.modules.map((module) => module.path)
    )
    assert.deepEqual(
      irModules.flatMap((module) => module.ir.functionDeclarations.map((item) => item.name)),
      ['greet', 'main']
    )
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('does not rebuild IR module records from legacy HIR fallback', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccjs-ir-module-no-hir-fallback-'))

  try {
    await writeFile(
      join(dir, 'lib.ts'),
      `export function greet(): void {
  console.log('from lib')
}
`
    )
    await writeFile(
      join(dir, 'main.ts'),
      `import { greet } from './lib.ts'

export function main(): void {
  greet()
}
`
    )

    const result = await compileFile(join(dir, 'main.ts'), {
      target: 'c'
    })
    const graph = {
      ...result.graph,
      modules: result.graph.modules.map((module, index) =>
        index === 0
          ? {
              ...module,
              ir: null
            }
          : module
      )
    }
    const irModules = collectIrModuleRecords(graph)

    assert.equal(irModules.length, result.graph.modules.length - 1)
    assert.deepEqual(
      irModules.map((module) => module.path),
      result.graph.modules.slice(1).map((module) => module.path)
    )
    assert.deepEqual(
      irModules.flatMap((module) => module.ir.functionDeclarations.map((item) => item.name)),
      ['main']
    )
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('emits C bundles directly from target-neutral IR module records', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccjs-bundle-ir-entrypoints-'))

  try {
    await writeFile(
      join(dir, 'lib.ts'),
      `export function greet(): void {
  console.log('from lib')
}
`
    )
    await writeFile(
      join(dir, 'main.ts'),
      `import { greet } from './lib.ts'

export function main(): void {
  greet()
}
`
    )

    const result = await compileFile(join(dir, 'main.ts'), {
      target: 'c',
      callMain: false
    })
    const irModules = collectIrModuleRecords(result.graph)
    const libEntry =
      irModules.find((module) => module.ir.functionDeclarations.some((item) => item.name === 'greet'))?.path ?? ''
    assert.notEqual(libEntry, '')
    const c = emitCBundleFromIrModules(irModules, result.graph.entry)
    const cWithLibEntry = emitCBundleFromIrModules(irModules, libEntry)

    assert.deepEqual(
      collectIrPrograms(irModules),
      irModules.map((module) => module.ir)
    )
    assert.equal(
      findIrEntryProgram(irModules, result.graph.entry)?.functionDeclarations.some((item) => item.name === 'main'),
      true
    )
    assert.equal(
      findIrEntryProgram(irModules, libEntry)?.functionDeclarations.some((item) => item.name === 'greet'),
      true
    )
    assert.match(c, /void greet\(void\);/)
    assert.match(c, /void ccjs_main\(void\);/)
    assert.doesNotMatch(c, /int main\(void\) \{[\s\S]*ccjs_main\(\);/)
    assert.doesNotMatch(cWithLibEntry, /int main\(void\) \{\n {2}ccjs_main\(\);/)
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('drives C bundle functions and main wrapper from stored target-neutral IR programs', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-bundle-ir-'))

  try {
    await writeFile(
      join(dir, 'lib.ts'),
      `export function greet(): void {
  console.log('from lib')
}
`
    )
    await writeFile(
      join(dir, 'main.ts'),
      `import { greet } from './lib.ts'

greet()
`
    )

    const result = await compileFile(join(dir, 'main.ts'), {
      target: 'c'
    })
    const graph = {
      ...result.graph,
      modules: result.graph.modules.map((module) => ({
        ...module,
        hir: null
      }))
    }
    const code = emitCBundleFromIrModules(collectIrModuleRecords(graph), graph.entry)

    assert.match(code, /void greet\(void\);/)
    assert.match(code, /void greet\(void\) \{/)
    assert.doesNotMatch(code, /ccjs_main/)
    assert.match(code, /int main\(void\) \{\n {2}double ccjs_return = 0;\n {2}greet\(\);/)
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('compiles static ESM import aliases to C bundles', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccjs-module-aliases-'))

  try {
    await writeFile(
      join(dir, 'lib.ts'),
      `export function greet(): void {
  console.log('from alias')
}
`
    )
    await writeFile(
      join(dir, 'main.ts'),
      `import { greet as sayHello } from './lib.ts'

export function main(): void {
  sayHello()
}
`
    )

    const c = await compileFile(join(dir, 'main.ts'), {
      target: 'c'
    })

    assert.match(c.code, /void sayHello\(void\);/)
    assert.match(c.code, /void sayHello\(void\) \{\n {2}greet\(\);/)
    assert.match(c.code, /ccjs_main\(void\) \{\n {2}sayHello\(\);/)
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('compiles static ESM type imports before checking modules', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccjs-module-type-imports-'))

  try {
    await writeFile(
      join(dir, 'types.ts'),
      `export type UserKind = 'admin' | 'guest'

type Profile = {
  kind: UserKind
}

export type User = {
  readonly name: string
  profile: Profile
}
`
    )
    await writeFile(
      join(dir, 'main.ts'),
      `import type { User as Person, UserKind } from './types.ts'

export function main(): void {
  const user: Person = { name: 'Ada', profile: { kind: 'admin' } }
  const kind: UserKind = 'admin'
  console.log(user.name, kind)
}
`
    )

    const c = await compileFile(join(dir, 'main.ts'), {
      target: 'c'
    })

    assert.match(c.code, /static const ccjs_field_info ccjs_shape_user_\d+_fields\[\]/)
    assert.match(c.code, /ccjs_object_get_known\(user, 0, &ccjs_log_value_\d+\)/)
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('resolves static ESM directory index imports', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccjs-module-index-imports-'))

  try {
    await mkdir(join(dir, 'lib'))
    await writeFile(
      join(dir, 'lib', 'index.ts'),
      `export function greet(): void {
  console.log('from index')
}
`
    )
    await writeFile(
      join(dir, 'main.ts'),
      `import { greet } from './lib'

export function main(): void {
  greet()
}
`
    )

    const c = await compileFile(join(dir, 'main.ts'), {
      target: 'c'
    })

    assert.equal(
      c.graph.modules.some((module) => module.path.endsWith('/lib/index.ts')),
      true
    )
    assert.match(c.code, /void greet\(void\);/)
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('compiles a static ESM module graph to C bundle', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccjs-modules-'))

  try {
    await writeFile(
      join(dir, 'lib.js'),
      `export function greet(): void {
  console.log('from lib')
}
`
    )
    await writeFile(
      join(dir, 'main.js'),
      `import { greet } from './lib.js'

export function main(): void {
  greet()
}
`
    )

    const result = await compileFile(join(dir, 'main.js'), {
      target: 'c'
    })

    assert.match(result.code, /void greet\(void\);/)
    assert.match(result.code, /void ccjs_main\(void\);/)
    assert.match(result.code, /void greet\(void\) \{/)
    assert.match(result.code, /greet\(\);/)
    assert.match(result.code, /int main\(void\) \{/)
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('rejects unknown imported exports', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccjs-modules-'))

  try {
    await writeFile(
      join(dir, 'lib.js'),
      `export function greet(): void {
  console.log('from lib')
}
`
    )
    await writeFile(
      join(dir, 'main.js'),
      `import { missing } from './lib.js'

export function main(): void {
  missing()
}
`
    )

    await assert.rejects(
      () =>
        compileFile(join(dir, 'main.js'), {
          target: 'c'
        }),
      (error) => {
        if (!(error instanceof CompileError)) {
          return false
        }

        assert.equal(
          error.diagnostics.some((item) => item.code === 'CCJS_UNKNOWN_EXPORT'),
          true
        )
        return true
      }
    )
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})
