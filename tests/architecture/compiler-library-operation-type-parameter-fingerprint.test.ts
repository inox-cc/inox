import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'

test('operation type parameter sources входят в fingerprint', () => {
  const explicit = createCompilerLibrarySet([fixtureLibrary('explicit-type-argument')])
  const receiver = createCompilerLibrarySet([fixtureLibrary('receiver-type-argument')])

  assert.notEqual(explicit.fingerprint, receiver.fingerprint)

  const plainArgument = createCompilerLibrarySet([argumentTypeFixture(false)])
  const unwrappedArgument = createCompilerLibrarySet([argumentTypeFixture(true)])
  assert.notEqual(plainArgument.fingerprint, unwrappedArgument.fingerprint)
})

function argumentTypeFixture(unwrap: boolean): CompilerLibraryDescriptor {
  const source = unwrap
    ? {
        source: 'argument-type' as const,
        argumentIndex: 0,
        unwrapTraitId: 'awaitable' as const,
        unwrapTraitArgumentIndex: 0
      }
    : { source: 'argument-type' as const, argumentIndex: 0 }

  return {
    ...fixtureLibrary('explicit-type-argument'),
    operations: [
      {
        libraryId: 'fixture',
        bindingId: 'global:make',
        operationId: 'fixture.make',
        kind: 'call',
        runtimeRequirements: [],
        typeParameters: [{ name: 'T', sources: [source] }],
        resultTypeRef: { kind: 'parameter', name: 'T' }
      }
    ]
  }
}

function fixtureLibrary(
  source: 'explicit-type-argument' | 'receiver-type-argument'
): CompilerLibraryDescriptor {
  return {
    id: 'fixture',
    dependencies: [],
    declarations: [],
    nativeTypes: [],
    operations: [
      {
        libraryId: 'fixture',
        bindingId: 'global:make',
        operationId: 'fixture.make',
        kind: 'call',
        runtimeRequirements: [],
        typeParameters: [{ name: 'T', sources: [{ source, argumentIndex: 0 }] }],
        resultTypeRef: { kind: 'parameter', name: 'T' }
      }
    ],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}
