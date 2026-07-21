import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type {
  CompilerLibraryDescriptor,
  LibraryArgumentNarrowingDescriptor
} from '../../compiler/extensions/types.ts'

test('argument narrowing валидируется и входит в fingerprint package operation', () => {
  const baseline = createCompilerLibrarySet([fixtureLibrary({ argumentIndex: 0, trueValueType: 'array' })]).fingerprint
  const changed = fixtureLibrary({ argumentIndex: 0, trueValueType: 'object' })
  const nonNullable = fixtureLibrary({ argumentIndex: 0, trueValueType: 'array', trueNonNullable: true })
  const typeRef = fixtureLibrary({
    argumentIndex: 0,
    trueTypeRef: { kind: 'primitive', name: 'string', nullable: false, ownership: 'value', traits: [] }
  })

  assert.notEqual(createCompilerLibrarySet([changed]).fingerprint, baseline)
  assert.notEqual(createCompilerLibrarySet([nonNullable]).fingerprint, baseline)
  assert.notEqual(createCompilerLibrarySet([typeRef]).fingerprint, baseline)
  assert.throws(
    () => createCompilerLibrarySet([fixtureLibrary({ argumentIndex: 2, trueValueType: 'array' })]),
    /narrows missing argument 2/
  )
})

function fixtureLibrary(argumentNarrowing: LibraryArgumentNarrowingDescriptor): CompilerLibraryDescriptor {
  return {
    id: 'fixture',
    dependencies: [],
    declarations: [],
    operations: [
      {
        libraryId: 'fixture',
        bindingId: 'global:predicate',
        operationId: 'fixture.predicate',
        kind: 'call',
        runtimeRequirements: [],
        minArgs: 1,
        maxArgs: 1,
        argumentNarrowing
      }
    ],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}
