import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSourceToIr } from '../../compiler/core.ts'
import { CompileError } from '../../compiler/diagnostics.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import { emptyCompilerLibrarySet } from '../../compiler/extensions/library-set.ts'
import { globalDeclarationLibrary } from './helpers/compiler-library-fixtures.ts'

const source = `
  const text = bridge(1)
  const version = bridgeVersion
  const instance = new Bridge(2)
`

test('ambient function, value и class существуют только в выбранном library set', () => {
  const libraries = createCompilerLibrarySet([
    globalDeclarationLibrary('global:bridge', `
      export {};
      declare global {
        function bridge(value: number): string;
        const bridgeVersion: number;
        class Bridge { constructor(value: number); }
      }
    `)
  ])
  const result = compileSourceToIr(source, { libraries })

  assert.equal(result.ir.body[0].init.valueType, 'string')
  assert.equal(result.ir.body[1].init.valueType, 'number')
  assert.equal(result.ir.body[2].init.valueType, 'object')
  assert.throws(
    () => compileSourceToIr(source, { libraries: emptyCompilerLibrarySet }),
    (error: unknown) =>
      error instanceof CompileError &&
      error.diagnostics[0].code === 'INOX_UNKNOWN_NAME' &&
      error.diagnostics[0].message === 'unknown name bridge'
  )
})
