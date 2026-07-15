import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSourceToIr } from '../../compiler/core.ts'
import { CompileError } from '../../compiler/diagnostics.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor, LibraryOperationDescriptor, TypeRef } from '../../compiler/extensions/types.ts'

const tableTypeId = 'fixture:index#Table'
const keyTypeRef: TypeRef = { kind: 'parameter', name: 'K' }
const valueTypeRef: TypeRef = { kind: 'parameter', name: 'V' }

test('generic index operations связывают key/value TypeRef из receiver', () => {
  const libraries = createCompilerLibrarySet([fixtureLibrary()])
  const result = compileSourceToIr("const table = new Table<string, number>()\ntable['answer'] = 42\nconst value = table['answer']\n", {
    libraries
  })
  const read = result.ast.body[2].init

  assert.equal(read.libraryOperationId, `${tableTypeId}#index-read`)
  assert.equal(read.valueType, 'number')
  assert.equal(read.nullable, true)
  assert.throws(
    () => compileSourceToIr("const table = new Table<string, number>()\ntable[1] = 'wrong'\n", { libraries }),
    (error: unknown) => error instanceof CompileError && error.diagnostics.length === 2
  )
})

function fixtureLibrary(): CompilerLibraryDescriptor {
  return {
    id: 'fixture:index',
    dependencies: [],
    declarations: [
      {
        libraryId: 'fixture:index',
        kind: 'global',
        source: 'stdlib/fixture-index/index.d.ts',
        declarationSource: 'export {}; declare global { interface Table<K, V> {} const Table: unknown; }',
        compilerImplemented: true
      }
    ],
    nativeTypes: [
      {
        libraryId: 'fixture:index',
        typeId: tableTypeId,
        declarationNames: ['Table'],
        valueType: 'object',
        cppType: 'FixtureTable',
        baseTypeIds: [],
        runtimeRequirements: [],
        typeParameters: ['K', 'V']
      }
    ],
    operations: [constructOperation(), indexOperation('index-read'), indexOperation('index-write')],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}

function constructOperation(): LibraryOperationDescriptor {
  return {
    libraryId: 'fixture:index',
    bindingId: 'global:Table',
    operationId: `${tableTypeId}#construct`,
    kind: 'construct',
    runtimeRequirements: [],
    typeParameters: [
      { name: 'K', sources: [{ source: 'explicit-type-argument', argumentIndex: 0 }] },
      { name: 'V', sources: [{ source: 'explicit-type-argument', argumentIndex: 1 }] }
    ],
    resultTypeRef: tableTypeRef(),
    minArgs: 0,
    maxArgs: 0,
    argumentChecks: []
  }
}

function indexOperation(kind: 'index-read' | 'index-write'): LibraryOperationDescriptor {
  const write = kind === 'index-write'

  return {
    libraryId: 'fixture:index',
    bindingId: `${tableTypeId}.*`,
    operationId: `${tableTypeId}#${kind}`,
    kind,
    runtimeRequirements: [],
    receiverTypeId: tableTypeId,
    typeParameters: [
      { name: 'K', sources: [{ source: 'receiver-type-argument', argumentIndex: 0 }] },
      { name: 'V', sources: [{ source: 'receiver-type-argument', argumentIndex: 1 }] }
    ],
    resultTypeRef: write ? valueTypeRef : { ...valueTypeRef, nullable: true },
    minArgs: write ? 2 : 1,
    maxArgs: write ? 2 : 1,
    argumentChecks: write
      ? [
          { valueTypes: [], typeRef: keyTypeRef },
          { valueTypes: [], typeRef: valueTypeRef }
        ]
      : [{ valueTypes: [], typeRef: keyTypeRef }]
  }
}

function tableTypeRef(): TypeRef {
  return {
    kind: 'nominal',
    typeId: tableTypeId,
    args: [keyTypeRef, valueTypeRef],
    nullable: false,
    ownership: 'value',
    traits: []
  }
}
