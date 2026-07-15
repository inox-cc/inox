import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSourceToIr } from '../../compiler/core.ts'
import { CompileError } from '../../compiler/diagnostics.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import { globalDeclarationLibrary } from './helpers/compiler-library-fixtures.ts'

test('ambient generic class подставляет explicit type argument в constructor', () => {
  const libraries = createCompilerLibrarySet([
    globalDeclarationLibrary(
      'global:box',
      'export {}; declare global { class Box<T> { constructor(value: T); } }'
    )
  ])

  assert.doesNotThrow(() => compileSourceToIr("new Box<string>('ready')\n", { libraries }))
  assert.throws(
    () => compileSourceToIr('new Box<string>(1)\n', { libraries }),
    (error: unknown) => error instanceof CompileError && error.diagnostics[0].code === 'INOX_TYPE_MISMATCH'
  )
})
