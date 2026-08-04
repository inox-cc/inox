import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'

test('observable side-effect metadata participates in the library fingerprint', () => {
  assert.notEqual(createCompilerLibrarySet([fixture(false)]).fingerprint, createCompilerLibrarySet([fixture(true)]).fingerprint)
})

function fixture(sideEffects: boolean): CompilerLibraryDescriptor {
  return {
    id: 'fixture',
    dependencies: [],
    declarations: [],
    nativeTypes: [],
    operations: [
      {
        libraryId: 'fixture',
        bindingId: 'global:fixture',
        operationId: 'fixture#call',
        kind: 'call',
        runtimeRequirements: [],
        cHasObservableSideEffects: sideEffects
      }
    ],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}
