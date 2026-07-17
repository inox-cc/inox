import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSourceToIr } from '../../compiler/core.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { LibraryOperationDescriptor } from '../../compiler/extensions/types.ts'
import { globalDeclarationLibrary } from './helpers/compiler-library-fixtures.ts'

test('package operation использует сигнатуру static-метода ambient global class', () => {
  const operation: LibraryOperationDescriptor = {
    libraryId: 'global:fixture',
    bindingId: 'global:Bridge.open',
    operationId: 'global:fixture#Bridge.open',
    kind: 'call',
    runtimeRequirements: [],
    cExpression: 'Bridge::open'
  }
  const libraries = createCompilerLibrarySet([
    globalDeclarationLibrary(
      'global:fixture',
      'export {}; declare global { class Bridge { static open(value: number): string; } }',
      [operation]
    )
  ])
  const result = compileSourceToIr('const value = Bridge.open(1)\n', { libraries })

  assert.equal(result.ir.body[0].init.libraryOperationId, 'global:fixture#Bridge.open')
  assert.equal(result.ir.body[0].init.valueType, 'string')
})
