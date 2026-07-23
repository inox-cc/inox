import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  compileMemoryPackageToCppModules,
  compileMemoryPackageToIrModules
} from '../../compiler/core.ts'
import { CompileError } from '../../compiler/diagnostics.ts'
import { emptyCompilerLibrarySet } from '../../compiler/extensions/library-set.ts'
import type { CompilerLibrarySet } from '../../compiler/extensions/types.ts'

const entry = '/project/main.ts'
const moduleSource = 'extension:opaque-module'
const files = [
  {
    path: entry,
    source: `import { providedValue } from '${moduleSource}'\nexport const localValue = 1\n`
  }
]

test('module graph and C planner consume declarations from the selected library provider', async () => {
  await assert.rejects(
    compileMemoryPackageToIrModules(entry, files, { libraries: emptyCompilerLibrarySet }),
    (error: unknown) =>
      error instanceof CompileError &&
      error.diagnostics[0].code === 'INOX_UNSUPPORTED_IMPORT_SOURCE'
  )

  const result = await compileMemoryPackageToCppModules(entry, files, {
    libraries: fixtureLibraries(),
    sourceRoot: '/project'
  })
  const main = result.graph.modules.find((module) => module.path === entry)
  const specifier = main?.imports[0].specifiers[0]

  assert.equal(specifier?.valueType, 'function')
  assert.equal(specifier?.returnType, 'string')
  assert.equal(result.graph.modules.length, 1)
  assert.ok(result.files.some((file) => file.path === 'main.cc'))
})

function fixtureLibraries(): CompilerLibrarySet {
  return {
    ...emptyCompilerLibrarySet,
    fingerprint: 'fixture:opaque-module:v1',
    declarations: [
      {
        libraryId: 'fixture:opaque-module',
        kind: 'module',
        source: moduleSource,
        declarationSource: 'export function providedValue(): string;\n',
        compilerImplemented: true
      }
    ]
  }
}
