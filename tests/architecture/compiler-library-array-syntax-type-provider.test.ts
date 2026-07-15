import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSourceToIr } from '../../compiler/core.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor, TypeRef } from '../../compiler/extensions/types.ts'

const boxTypeId = 'fixture#Box'
const sequenceTypeId = 'fixture#Sequence'
const parameterTypeRef: TypeRef = { kind: 'parameter', name: 'T' }

test('array syntax получает exact TypeRef от intrinsic type provider', () => {
  const result = compileSourceToIr('const current = box\n', {
    libraries: createCompilerLibrarySet([fixtureLibrary()])
  })
  const current = result.ast.body[0].init
  const nested = current.typeRef.args[0]

  assert.equal(nested.kind, 'nominal')
  assert.equal(nested.typeId, sequenceTypeId)
  assert.equal(nested.args[0].kind, 'object')
  assert.deepEqual(nested.args[0].fields, [{ name: 'selected', typeRef: primitiveNumberTypeRef(), readonly: true }])
  assert.deepEqual(result.hir.body[0].init.typeRef, current.typeRef)
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
        declarationSource:
          'export {}; declare global { interface Item { readonly selected: number; } interface Box<T> {} const box: Box<Item[]>; }',
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
      },
      {
        libraryId: 'fixture',
        typeId: boxTypeId,
        declarationNames: ['Box'],
        valueType: 'object',
        cppType: 'FixtureBox',
        baseTypeIds: [],
        runtimeRequirements: [],
        typeParameters: ['T']
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
        resultTypeRef: nominalTypeRef(sequenceTypeId, [parameterTypeRef]),
        minArgs: 0,
        maxArgs: 0,
        argumentChecks: []
      }
    ],
    intrinsicBindings: [{ role: 'array-literal', bindingId: 'intrinsic:fixture-sequence' }],
    runtimeRequirements: []
  }
}

function nominalTypeRef(typeId: string, args: TypeRef[]): TypeRef {
  return {
    kind: 'nominal',
    typeId,
    args,
    nullable: false,
    ownership: 'value',
    traits: []
  }
}

function primitiveNumberTypeRef(): TypeRef {
  return {
    kind: 'primitive',
    name: 'number',
    nullable: false,
    ownership: 'value',
    traits: []
  }
}
