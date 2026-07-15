import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type {
  CompilerLibraryDescriptor,
  LibraryCResultMappingDescriptor,
  TypeRef
} from '../../compiler/extensions/types.ts'

test('library fingerprint covers structural C++ result mappings', () => {
  const baseline = fingerprint(resultMapping('FixtureStats', 'total_count', 'size_t'))

  assert.equal(fingerprint(resultMapping('FixtureStats', 'total_count', 'size_t')), baseline)
  assert.notEqual(fingerprint(resultMapping('OtherStats', 'total_count', 'size_t')), baseline)
  assert.notEqual(fingerprint(resultMapping('FixtureStats', 'other_total', 'size_t')), baseline)
  assert.notEqual(fingerprint(resultMapping('FixtureStats', 'total_count', 'double')), baseline)
})

function fingerprint(cResultMapping: LibraryCResultMappingDescriptor): string {
  return createCompilerLibrarySet([fixtureLibrary(cResultMapping)]).fingerprint
}

function fixtureLibrary(cResultMapping: LibraryCResultMappingDescriptor): CompilerLibraryDescriptor {
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
        resultTypeRef: objectTypeRef(),
        cResultMapping
      }
    ],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}

function resultMapping(cppType: string, cMember: string, fieldCppType: string): LibraryCResultMappingDescriptor {
  return {
    cppType,
    fields: [{ name: 'total', cMember, cppType: fieldCppType }]
  }
}

function objectTypeRef(): TypeRef {
  return {
    kind: 'object',
    fields: [
      {
        name: 'total',
        typeRef: {
          kind: 'primitive',
          name: 'number',
          nullable: false,
          ownership: 'value',
          traits: []
        },
        readonly: true
      }
    ],
    nullable: false,
    ownership: 'value',
    traits: []
  }
}
