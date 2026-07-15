import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor, NominalTypeRef, TypeRef } from '../../compiler/extensions/types.ts'

test('builder validates recursive TypeRef contracts', () => {
  const invalidRefs: Array<{ typeRef: TypeRef; message: RegExp; legacyValueType?: string }> = [
    {
      typeRef: nominalTypeRef('fixture#Missing'),
      message: /unknown nominal type fixture#Missing/
    },
    {
      typeRef: {
        ...nominalTypeRef('fixture#Box'),
        traits: [
          { traitId: 'iterable' as const, args: [primitiveTypeRef('string')] },
          { traitId: 'iterable' as const, args: [primitiveTypeRef('number')] }
        ]
      },
      message: /duplicate trait iterable/
    },
    {
      typeRef: {
        kind: 'object',
        fields: [
          { name: 'value', typeRef: primitiveTypeRef('string'), readonly: true },
          { name: 'value', typeRef: primitiveTypeRef('number'), readonly: false }
        ],
        nullable: false,
        ownership: 'value',
        traits: []
      },
      message: /duplicate object field value/
    },
    {
      typeRef: nominalTypeRef('fixture#Box'),
      legacyValueType: 'object',
      message: /cannot combine resultTypeRef with legacy result metadata valueType/
    }
  ]

  for (let index = 0; index < invalidRefs.length; index = index + 1) {
    const invalid = invalidRefs[index]
    assert.throws(
      () => createCompilerLibrarySet([fixtureLibrary(invalid.typeRef, invalid.legacyValueType)]),
      invalid.message
    )
  }
})

function fixtureLibrary(resultTypeRef: TypeRef, valueType?: string): CompilerLibraryDescriptor {
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
        resultTypeRef,
        valueType
      }
    ],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}

function nominalTypeRef(typeId: string): NominalTypeRef {
  return {
    kind: 'nominal',
    typeId,
    args: [],
    nullable: false,
    ownership: 'owned',
    traits: []
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
