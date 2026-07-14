import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSourceToIr } from '../../compiler/core.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import { globalDeclarationLibrary } from './helpers/compiler-library-fixtures.ts'

test('module-local function shadowing побеждает ambient library binding', () => {
  const libraries = createCompilerLibrarySet([
    globalDeclarationLibrary(
      'global:bridge',
      'export {}; declare global { function bridge(value: number): string; }',
      [
        {
          libraryId: 'global:bridge',
          bindingId: 'global:bridge',
          operationId: 'global:bridge#call',
          kind: 'call',
          runtimeRequirements: [],
          cExpression: 'bridge',
          valueType: 'string'
        }
      ]
    )
  ])
  const result = compileSourceToIr(`
    function bridge(value: number): number { return value }
    const result = bridge(1)
  `, { libraries })

  assert.equal(result.ir.body[1].init.valueType, 'number')
  assert.equal(result.ir.body[1].init.libraryOperationId, undefined)
})
