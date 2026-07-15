import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'

test('builder проверяет TypeRef аргумента у variant без result', () => {
  const library: CompilerLibraryDescriptor = {
    id: 'fixture',
    dependencies: [],
    declarations: [],
    operations: [
      {
        libraryId: 'fixture',
        bindingId: 'global:consume',
        operationId: 'fixture.consume',
        kind: 'call',
        runtimeRequirements: [],
        variants: [{ argumentChecks: [{ valueTypes: [], typeRef: { kind: 'parameter', name: 'Missing' } }] }]
      }
    ],
    intrinsicBindings: [],
    runtimeRequirements: []
  }

  assert.throws(
    () => createCompilerLibrarySet([library]),
    /operation fixture\.consume variant 0 argument 0 uses type parameter Missing outside template scope/
  )
})
