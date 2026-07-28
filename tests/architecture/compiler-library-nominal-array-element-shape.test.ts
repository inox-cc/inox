import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSourceToIr } from '../../compiler/core.ts'
import { createCompilerLibrarySetWithSyntheticGlobalDeclarations as createCompilerLibrarySet } from './helpers/compiler-library-fixtures.ts'
import type { CompilerLibraryDescriptor, TypeRef } from '../../compiler/extensions/types.ts'

test('generic Array<NativeType> сохраняет shape nominal element для for-of', () => {
  const result = compileSourceToIr(
    'const entries = fixture.items()\nfor (const entry of entries) {\n  const name = entry.name\n}\n',
    { libraries: createCompilerLibrarySet([fixtureLibrary()]) }
  )
  const declaration = result.ir.body[0]
  const loop = result.ir.body[1]
  const fields = loop.shape?.fields ?? []

  assert.equal(declaration.shape?.libraryCppType, 'ArrayClass')
  assert.equal(loop.type, 'ForOfStatement')
  assert.equal(loop.shape?.libraryCppType, 'FixtureItem')
  assert.equal(fields.length, 1)
  assert.equal(fields[0].name, 'name')
})

function fixtureLibrary(): CompilerLibraryDescriptor {
  const itemType = nominalType('fixture#Item')

  return {
    id: 'fixture',
    dependencies: [],
    declarations: [],
    nativeTypes: [
      {
        libraryId: 'fixture',
        typeId: 'fixture#Array',
        declarationNames: ['FixtureArray'],
        valueType: 'array',
        cppType: 'ArrayClass',
        baseTypeIds: [],
        runtimeRequirements: []
      },
      {
        libraryId: 'fixture',
        typeId: 'fixture#Item',
        declarationNames: ['FixtureItem'],
        valueType: 'object',
        cppType: 'FixtureItem',
        baseTypeIds: [],
        runtimeRequirements: [],
        fields: [{ name: 'name', valueType: 'string', readonly: true, cMember: 'name' }]
      }
    ],
    operations: [
      {
        libraryId: 'fixture',
        bindingId: 'global:fixture.items',
        operationId: 'fixture#items',
        kind: 'call',
        runtimeRequirements: [],
        cExpression: 'fixture.items',
        cArgumentKinds: [],
        minArgs: 0,
        maxArgs: 0,
        argumentChecks: [],
        resultTypeRef: arrayType(itemType)
      }
    ],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}

function nominalType(typeId: string): TypeRef {
  return { kind: 'nominal', typeId, args: [], nullable: false, ownership: 'value', traits: [] }
}

function arrayType(elementType: TypeRef): TypeRef {
  return {
    kind: 'nominal',
    typeId: 'fixture#Array',
    args: [elementType],
    nullable: false,
    ownership: 'value',
    traits: [{ traitId: 'iterable', args: [elementType] }]
  }
}
