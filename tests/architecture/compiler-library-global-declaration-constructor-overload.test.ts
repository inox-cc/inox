import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSourceToIr } from '../../compiler/core.ts'
import { CompileError } from '../../compiler/diagnostics.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import { globalDeclarationLibrary } from './helpers/compiler-library-fixtures.ts'

test('ambient class constructor overloads проверяются по declaration', () => {
  const libraries = createCompilerLibrarySet([
    globalDeclarationLibrary('global:bridge', `
      export {};
      declare global {
        class Bridge {
          constructor(value: number);
          constructor(value: string);
        }
      }
    `)
  ])
  const result = compileSourceToIr("const bridge = new Bridge('ready')\n", { libraries })

  assert.equal(result.ir.body[0].init.valueType, 'object')
  assert.throws(
    () => compileSourceToIr('new Bridge(true)\n', { libraries }),
    (error: unknown) =>
      error instanceof CompileError &&
      error.diagnostics[0].code === 'INOX_TYPE_MISMATCH'
  )
})
