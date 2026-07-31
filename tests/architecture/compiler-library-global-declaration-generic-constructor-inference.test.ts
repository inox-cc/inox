import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSourceToIr } from '../../compiler/core.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import { globalDeclarationLibrary } from './helpers/compiler-library-fixtures.ts'

test('ambient generic class выводит type argument из constructor argument', () => {
  const libraries = createCompilerLibrarySet([
    globalDeclarationLibrary('global:box', 'export {}; declare global { class Box<T> { constructor(value: T); } }')
  ])

  assert.doesNotThrow(() => compileSourceToIr("new Box('ready')\n", { libraries }))
})
