import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSourceToIr } from '../../compiler/core.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor, TypeRef } from '../../compiler/extensions/types.ts'

const sequenceTypeId = 'fixture#Sequence'
const parameterTypeRef: TypeRef = { kind: 'parameter', name: 'T' }

test('array literal получает TypeRef того же intrinsic provider, что и T[]', () => {
  const result = compileSourceToIr('const empty: Item[] = []\nconst values: Item[] = [{ selected: 1 }]\n', {
    libraries: createCompilerLibrarySet([fixtureLibrary()])
  })
  const empty = result.ast.body[0].init.typeRef
  const values = result.ast.body[1].init.typeRef

  assert.equal(empty.kind, 'nominal')
  assert.equal(empty.typeId, sequenceTypeId)
  assert.equal(values.kind, 'nominal')
  assert.equal(values.typeId, sequenceTypeId)
  assert.equal(values.args[0].kind, 'object')
  assert.deepEqual(result.hir.body[1].init.typeRef, values)
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
        declarationSource: 'export {}; declare global { interface Item { readonly selected: number; } }',
        compilerImplemented: true
      }
    ],
    nativeTypes: [
      {
        libraryId: 'fixture',
        typeId: sequenceTypeId,
        declarationNames: ['FixtureSequence'],
        valueType: 'object',
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
        cSequenceMaterialization: fixtureSequenceMaterialization(),
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

function fixtureSequenceMaterialization() {
  return {
    createExpression: 'FixtureSequence::empty()',
    appendElementExpression: '$target.add($value)',
    appendSpreadExpression: '$target.addAll($value)',
    failureMode: 'thrown' as const
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
