import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSourceToIr } from '../../compiler/core.ts'
import type { CompilerLibrarySet, TypeRef } from '../../compiler/extensions/types.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

const keyTypeRef: TypeRef = { kind: 'parameter', name: 'K' }
const valueTypeRef: TypeRef = { kind: 'parameter', name: 'V' }

test('library descriptor infers type parameters from array literal columns', () => {
  const result = compileSourceToIr("const table = new NativeTable([['name', 1], ['count', 2]])\n", {
    libraries: fixtureLibraries()
  })
  const typeRef = result.hir.body[0].init.typeRef

  assert.equal(typeRef?.kind, 'nominal')
  assert.equal(typeRef?.typeId, 'fixture:table#NativeTable')
  assert.equal(typeRef?.args[0]?.kind, 'primitive')
  assert.equal(typeRef?.args[0]?.name, 'string')
  assert.equal(typeRef?.args[1]?.kind, 'primitive')
  assert.equal(typeRef?.args[1]?.name, 'number')
})

function fixtureLibraries(): CompilerLibrarySet {
  return {
    ...defaultCompilerLibrarySet,
    declarations: [
      ...defaultCompilerLibrarySet.declarations,
      {
        libraryId: 'fixture:table',
        kind: 'global',
        source: 'stdlib/fixture-table/index.d.ts',
        declarationSource: 'export {}; declare global { interface NativeTable<K, V> {} }',
        compilerImplemented: true
      }
    ],
    nativeTypes: [
      ...defaultCompilerLibrarySet.nativeTypes,
      {
        libraryId: 'fixture:table',
        typeId: 'fixture:table#NativeTable',
        declarationNames: ['NativeTable'],
        valueType: 'object',
        cppType: 'FixtureNativeTable',
        cValueAdapter: 'FixtureNativeTable($value)',
        baseTypeIds: [],
        runtimeRequirements: [],
        typeParameters: ['K', 'V']
      }
    ],
    operations: [
      ...defaultCompilerLibrarySet.operations,
      {
        libraryId: 'fixture:table',
        bindingId: 'global:NativeTable',
        operationId: 'fixture:table#NativeTable.construct',
        kind: 'construct',
        runtimeRequirements: [],
        typeParameters: [
          {
            name: 'K',
            sources: [{ source: 'argument-array-literal-column', argumentIndex: 0, elementIndex: 0 }]
          },
          {
            name: 'V',
            sources: [{ source: 'argument-array-literal-column', argumentIndex: 0, elementIndex: 1 }]
          }
        ],
        resultTypeRef: nativeTableTypeRef(),
        minArgs: 1,
        maxArgs: 1,
        argumentChecks: [{ valueTypes: ['array'] }]
      }
    ]
  }
}

function nativeTableTypeRef(): TypeRef {
  return {
    kind: 'nominal',
    typeId: 'fixture:table#NativeTable',
    args: [keyTypeRef, valueTypeRef],
    nullable: false,
    ownership: 'value',
    traits: []
  }
}
