import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor, TypeRef } from '../../compiler/extensions/types.ts'

test('nullable qualifier параметра входит в library-set fingerprint', () => {
  const required = createCompilerLibrarySet([fixtureLibrary(false)]).fingerprint
  const nullable = createCompilerLibrarySet([fixtureLibrary(true)]).fingerprint

  assert.notEqual(required, nullable)
})

function fixtureLibrary(nullable: boolean): CompilerLibraryDescriptor {
  const resultTypeRef: TypeRef = nullable
    ? { kind: 'parameter', name: 'T', nullable: true }
    : { kind: 'parameter', name: 'T' }

  return {
    id: 'fixture',
    dependencies: [],
    declarations: [],
    nativeTypes: [],
    operations: [
      {
        libraryId: 'fixture',
        bindingId: 'global:fixture',
        operationId: 'fixture.result',
        kind: 'call',
        runtimeRequirements: [],
        typeParameters: [{ name: 'T', sources: [{ source: 'explicit-type-argument', argumentIndex: 0 }] }],
        resultTypeRef
      }
    ],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}
