import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { createCompilerLibrarySetWithSyntheticGlobalDeclarations as createCompilerLibrarySet } from './helpers/compiler-library-fixtures.ts'
import type {
  CompilerLibraryDescriptor,
  LibraryOperationDescriptor,
  NominalTypeRef,
  PrimitiveTypeRef
} from '../../compiler/extensions/types.ts'

test('operation dispatch returns the value type resolved from resultTypeRef', () => {
  const libraries = createCompilerLibrarySet([fixtureLibrary()])
  const result = compileSource(
    'const bytes = new FixtureBytes()\nconst copy = bytes.slice()\nconst length = copy.length\n',
    { libraries, target: 'cc' }
  )

  assert.equal(result.ast.body[0].valueType, 'bytes')
  assert.equal(result.ast.body[1].valueType, 'bytes')
  assert.equal(result.ast.body[2].valueType, 'number')
  assert.equal(result.hir.body[0].valueType, 'bytes')
  assert.equal(result.hir.body[1].valueType, 'bytes')
  assert.equal(result.hir.body[2].valueType, 'number')
})

function fixtureLibrary(): CompilerLibraryDescriptor {
  const typeId = 'fixture#Bytes'
  const bytesTypeRef: NominalTypeRef = {
    kind: 'nominal',
    typeId,
    args: [],
    nullable: false,
    ownership: 'value',
    traits: []
  }
  const numberTypeRef: PrimitiveTypeRef = {
    kind: 'primitive',
    name: 'number',
    nullable: false,
    ownership: 'value',
    traits: []
  }
  const operations: LibraryOperationDescriptor[] = [
    {
      libraryId: 'fixture',
      bindingId: 'global:FixtureBytes',
      operationId: 'fixture#Bytes#construct',
      kind: 'construct',
      runtimeRequirements: [],
      cExpression: 'FixtureBytes',
      cArgumentKinds: [],
      resultTypeRef: bytesTypeRef,
      minArgs: 0,
      maxArgs: 0,
      argumentChecks: []
    },
    {
      libraryId: 'fixture',
      bindingId: `${typeId}.slice`,
      operationId: `${typeId}#slice`,
      kind: 'call',
      runtimeRequirements: [],
      receiverTypeId: typeId,
      cExpression: 'slice',
      cArgumentKinds: ['receiver'],
      cCallStyle: 'member',
      resultTypeRef: bytesTypeRef,
      minArgs: 0,
      maxArgs: 0,
      argumentChecks: []
    },
    {
      libraryId: 'fixture',
      bindingId: `${typeId}.length`,
      operationId: `${typeId}#read:length`,
      kind: 'member-read',
      runtimeRequirements: [],
      receiverTypeId: typeId,
      cExpression: 'length',
      cArgumentKinds: ['receiver'],
      cCallStyle: 'member',
      resultTypeRef: numberTypeRef
    }
  ]

  return {
    id: 'fixture',
    dependencies: [],
    declarations: [],
    nativeTypes: [
      {
        libraryId: 'fixture',
        typeId,
        declarationNames: ['FixtureBytes'],
        valueType: 'bytes',
        cppType: 'FixtureBytes',
        baseTypeIds: [],
        runtimeRequirements: []
      }
    ],
    operations,
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}
