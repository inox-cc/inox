import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSourceToIr } from '../../compiler/core.ts'
import { CompileError } from '../../compiler/diagnostics.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import { emptyCompilerLibrarySet } from '../../compiler/extensions/library-set.ts'
import { globalDeclarationLibrary } from './helpers/compiler-library-fixtures.ts'

const source = 'const stats = fixture.tools.inspect()\n'

test('ambient nested namespace создаёт library-owned object path', () => {
  const libraries = createCompilerLibrarySet([
    globalDeclarationLibrary(
      'global:fixture',
      `
      export {};
      declare global {
        interface FixtureStats {
          readonly count: number;
        }

        namespace fixture {
          namespace tools {
            function inspect(): FixtureStats;
          }
        }
      }
    `
    )
  ])
  const result = compileSourceToIr(source, { libraries })
  const stats = result.ir.body[0].init

  assert.equal(stats.valueType, 'object')
  assert.equal(stats.shape?.fields[0].name, 'count')
  assert.equal(stats.shape?.fields[0].readonly, true)
  assert.throws(
    () => compileSourceToIr(source, { libraries: emptyCompilerLibrarySet }),
    (error: unknown) =>
      error instanceof CompileError &&
      error.diagnostics[0].code === 'INOX_UNKNOWN_NAME' &&
      error.diagnostics[0].message === 'unknown name fixture'
  )
})
