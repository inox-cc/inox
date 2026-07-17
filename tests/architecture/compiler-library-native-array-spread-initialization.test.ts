import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor, TypeRef } from '../../compiler/extensions/types.ts'

const sequenceTypeId = 'fixture#Sequence'
const parameterTypeRef: TypeRef = { kind: 'parameter', name: 'T' }

test('array spread brace-initializes an arbitrary library native facade', () => {
  const result = compileSource(
    'const source: Item[] = []\nconst values: Item[] = [...source]\n',
    { libraries: createCompilerLibrarySet([fixtureLibrary()]), target: 'cc' }
  )

  assert.match(result.code, /FixtureSequence inox_spread_array_\d+\{source\};/)
  assert.doesNotMatch(result.code, /FixtureSequence inox_spread_array_\d+\(source\);/)
})

function fixtureLibrary(): CompilerLibraryDescriptor {
  return {
    id: 'fixture',
    dependencies: [],
    declarations: [
      {
        libraryId: 'fixture',
        kind: 'global',
        source: 'stdlib/fixture/index.d.ts',
        declarationSource: 'export {}; declare global { interface Item { value: number } }',
        compilerImplemented: true
      }
    ],
    nativeTypes: [
      {
        libraryId: 'fixture',
        typeId: sequenceTypeId,
        declarationNames: ['FixtureSequence'],
        valueType: 'array',
        cppType: 'FixtureSequence',
        baseTypeIds: [],
        runtimeRequirements: [],
        typeParameters: ['T'],
        traits: [{ traitId: 'iterable', args: [parameterTypeRef] }]
      }
    ],
    operations: [
      {
        libraryId: 'fixture',
        bindingId: 'intrinsic:fixture-sequence',
        operationId: 'fixture.sequence.intrinsic',
        kind: 'construct',
        runtimeRequirements: [],
        typeParameters: [{ name: 'T', sources: [{ source: 'contextual-type-argument', argumentIndex: 0 }] }],
        resultTypeRef: nominalSequenceTypeRef(),
        minArgs: 0,
        maxArgs: 0,
        argumentChecks: []
      }
    ],
    intrinsicBindings: [{ role: 'array-literal', bindingId: 'intrinsic:fixture-sequence' }],
    runtimeRequirements: []
  }
}

function nominalSequenceTypeRef(): TypeRef {
  return {
    kind: 'nominal',
    typeId: sequenceTypeId,
    args: [parameterTypeRef],
    nullable: false,
    ownership: 'value',
    traits: []
  }
}
