import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor, TypeRef } from '../../compiler/extensions/types.ts'

test('structural TypeRef uses a separate C++ result mapping', () => {
  const resultTypeRef = fixtureTypeRef()
  const libraries = createCompilerLibrarySet([fixtureLibrary(resultTypeRef)])
  const result = compileSource('const stats = readFixtureStats()\nconst total = stats.total\n', {
    libraries,
    target: 'cc'
  })
  const astCall = result.ast.body[0].init
  const hirCall = result.hir.body[0].init
  const astField = astCall.shape?.fields[0]
  const hirField = hirCall.shape?.fields[0]

  assert.deepEqual(astCall.typeRef, resultTypeRef)
  assert.deepEqual(hirCall.typeRef, resultTypeRef)
  assert.equal(astCall.shape?.libraryCppType, 'FixtureStats')
  assert.equal(hirCall.shape?.libraryCppType, 'FixtureStats')
  assert.equal(astField?.libraryCMember, 'total_count')
  assert.equal(hirField?.libraryCMember, 'total_count')
  assert.equal(astField?.libraryCppType, 'size_t')
  assert.equal(hirField?.libraryCppType, 'size_t')
  assert.match(result.code, /auto inox_library_object_\d+ = FixtureStats::read\(\)/)
  assert.match(result.code, /stats\.total_count/)
})

function fixtureLibrary(resultTypeRef: TypeRef): CompilerLibraryDescriptor {
  return {
    id: 'fixture',
    dependencies: [],
    declarations: [
      {
        libraryId: 'fixture',
        kind: 'global',
        source: 'stdlib/fixture/index.d.ts',
        declarationSource: 'export {}; declare global { function readFixtureStats(): unknown; }',
        compilerImplemented: true
      }
    ],
    operations: [
      {
        libraryId: 'fixture',
        bindingId: 'global:readFixtureStats',
        operationId: 'fixture#read-stats',
        kind: 'call',
        runtimeRequirements: [],
        cExpression: 'FixtureStats::read',
        cArgumentKinds: [],
        resultTypeRef,
        cResultMapping: {
          cppType: 'FixtureStats',
          fields: [
            {
              name: 'total',
              cMember: 'total_count',
              cppType: 'size_t'
            }
          ]
        },
        minArgs: 0,
        maxArgs: 0,
        argumentChecks: []
      }
    ],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}

function fixtureTypeRef(): TypeRef {
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
