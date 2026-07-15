import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type {
  CompilerLibraryDescriptor,
  LibraryCResultMappingDescriptor,
  TypeRef
} from '../../compiler/extensions/types.ts'

test('builder validates structural C++ result mappings against TypeRef fields', () => {
  const validMapping = resultMapping([{ name: 'total', cMember: 'total_count' }])
  const invalidCases: Array<{
    typeRef?: TypeRef
    mapping: LibraryCResultMappingDescriptor
    message: RegExp
  }> = [
    {
      mapping: validMapping,
      message: /C\+\+ result mapping requires resultTypeRef/
    },
    {
      typeRef: primitiveTypeRef(),
      mapping: validMapping,
      message: /C\+\+ result field mappings require object resultTypeRef/
    },
    {
      typeRef: objectTypeRef(),
      mapping: resultMapping([
        { name: 'total', cMember: 'total_count' },
        { name: 'total', cMember: 'other_total' }
      ]),
      message: /duplicate C\+\+ result field mapping total/
    },
    {
      typeRef: objectTypeRef(),
      mapping: resultMapping([{ name: 'missing', cMember: 'missing' }]),
      message: /unknown C\+\+ result field mapping missing/
    }
  ]

  for (let index = 0; index < invalidCases.length; index = index + 1) {
    const invalid = invalidCases[index]
    assert.throws(() => createCompilerLibrarySet([fixtureLibrary(invalid.typeRef, invalid.mapping)]), invalid.message)
  }
})

function fixtureLibrary(
  resultTypeRef: TypeRef | undefined,
  cResultMapping: LibraryCResultMappingDescriptor
): CompilerLibraryDescriptor {
  return {
    id: 'fixture',
    dependencies: [],
    declarations: [],
    operations: [
      {
        libraryId: 'fixture',
        bindingId: 'global:readFixtureStats',
        operationId: 'fixture#read-stats',
        kind: 'call',
        runtimeRequirements: [],
        resultTypeRef,
        cResultMapping
      }
    ],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}

function resultMapping(fields: LibraryCResultMappingDescriptor['fields']): LibraryCResultMappingDescriptor {
  return { cppType: 'FixtureStats', fields }
}

function objectTypeRef(): TypeRef {
  return {
    kind: 'object',
    fields: [
      {
        name: 'total',
        typeRef: primitiveTypeRef(),
        readonly: true
      }
    ],
    nullable: false,
    ownership: 'value',
    traits: []
  }
}

function primitiveTypeRef(): TypeRef {
  return {
    kind: 'primitive',
    name: 'number',
    nullable: false,
    ownership: 'value',
    traits: []
  }
}
