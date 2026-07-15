import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSourceToIr } from '../../compiler/core.ts'
import { CompileError } from '../../compiler/diagnostics.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import { globalDeclarationLibrary } from './helpers/compiler-library-fixtures.ts'

const libraries = createCompilerLibrarySet([
  globalDeclarationLibrary('global:box', `
    export {};
    declare global {
      interface Box<T> {
        readonly value: T;
        read(): T;
        write(value: T): void;
      }

      const box: Box<string>;
    }
  `)
])

test('ambient generic подставляет type argument в поля и методы', () => {
  const result = compileSourceToIr("box.write('ready')\nconst value = box.read()\n", { libraries })
  const declaration = result.ir.body[1]

  assert.equal(declaration.init.valueType, 'string')
  assert.throws(
    () => compileSourceToIr('box.write(1)\n', { libraries }),
    (error: unknown) =>
      error instanceof CompileError && error.diagnostics[0].code === 'INOX_TYPE_MISMATCH'
  )
})
