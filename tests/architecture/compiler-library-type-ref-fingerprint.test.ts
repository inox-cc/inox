import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type {
  CompilerLibraryDescriptor,
  NominalTypeRef,
  TypeRef
} from '../../compiler/extensions/types.ts'

test('library fingerprint covers the complete recursive TypeRef', () => {
  const baseline = fingerprint(genericBoxTypeRef())
  const changedArgument = genericBoxTypeRef()
  changedArgument.args[0] = primitiveTypeRef('number')
  const changedTrait = genericBoxTypeRef()
  changedTrait.traits[0].args[0] = primitiveTypeRef('number')
  const changedNullable = { ...genericBoxTypeRef(), nullable: true }
  const changedOwnership = { ...genericBoxTypeRef(), ownership: 'borrowed' as const }

  assert.equal(fingerprint(genericBoxTypeRef()), baseline)
  assert.notEqual(fingerprint(changedArgument), baseline)
  assert.notEqual(fingerprint(changedTrait), baseline)
  assert.notEqual(fingerprint(changedNullable), baseline)
  assert.notEqual(fingerprint(changedOwnership), baseline)
})

function fingerprint(typeRef: TypeRef): string {
  return createCompilerLibrarySet([fixtureLibrary(typeRef)]).fingerprint
}

function fixtureLibrary(resultTypeRef: TypeRef): CompilerLibraryDescriptor {
  return {
    id: 'fixture',
    dependencies: [],
    declarations: [],
    nativeTypes: [
      {
        libraryId: 'fixture',
        typeId: 'fixture#Box',
        declarationNames: ['FixtureBox'],
        valueType: 'object',
        cppType: 'FixtureBox',
        baseTypeIds: [],
        runtimeRequirements: []
      }
    ],
    operations: [
      {
        libraryId: 'fixture',
        bindingId: 'global:makeFixture',
        operationId: 'fixture#make',
        kind: 'call',
        runtimeRequirements: [],
        resultTypeRef
      }
    ],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}

function genericBoxTypeRef(): NominalTypeRef {
  return {
    kind: 'nominal',
    typeId: 'fixture#Box',
    args: [primitiveTypeRef('string')],
    nullable: false,
    ownership: 'owned',
    traits: [
      {
        traitId: 'iterable',
        args: [primitiveTypeRef('string')]
      }
    ]
  }
}

function primitiveTypeRef(name: 'number' | 'string'): TypeRef {
  return {
    kind: 'primitive',
    name,
    nullable: false,
    ownership: 'value',
    traits: []
  }
}
