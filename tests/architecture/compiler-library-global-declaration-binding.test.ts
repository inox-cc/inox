import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSourceToIr } from '../../compiler/core.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor, LibraryOperationDescriptor } from '../../compiler/extensions/types.ts'
import { globalDeclarationLibrary } from './helpers/compiler-library-fixtures.ts'

test('ambient symbol выбирает operation своего package owner', () => {
  const libraries = createCompilerLibrarySet([
    operationOnlyLibrary('global:a-wrong', bridgeOperation('global:a-wrong', 'wrong#bridge')),
    globalDeclarationLibrary(
      'global:z-bridge',
      'export {}; declare global { function bridge(value: number): string; }',
      [bridgeOperation('global:z-bridge', 'right#bridge')]
    )
  ])
  const result = compileSourceToIr('const result = bridge(1)\n', { libraries })

  assert.equal(result.ir.body[0].init.libraryOperationId, 'right#bridge')
  assert.equal(result.ir.body[0].init.valueType, 'string')
})

function bridgeOperation(libraryId: string, operationId: string): LibraryOperationDescriptor {
  return {
    libraryId,
    bindingId: 'global:bridge',
    operationId,
    kind: 'call',
    runtimeRequirements: [],
    cExpression: 'bridge'
  }
}

function operationOnlyLibrary(id: string, operation: LibraryOperationDescriptor): CompilerLibraryDescriptor {
  return {
    id,
    dependencies: [],
    declarations: [],
    nativeTypes: [],
    operations: [operation],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}
