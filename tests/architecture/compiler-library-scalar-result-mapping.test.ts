import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { createCompilerLibrarySetWithSyntheticGlobalDeclarations as createCompilerLibrarySet } from './helpers/compiler-library-fixtures.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'

test('primitive TypeRef can declare a separate C++ result representation', () => {
  const libraries = createCompilerLibrarySet([fixtureLibrary()])
  const result = compileSource('const text = readFixtureText()\n', { libraries, target: 'cc' })
  const astCall = result.ast.body[0].init
  const hirCall = result.hir.body[0].init

  assert.equal(result.ast.body[0].valueType, 'string')
  assert.equal(result.hir.body[0].valueType, 'string')
  assert.equal(astCall.libraryCppType, 'inox::String')
  assert.equal(hirCall.libraryCppType, 'inox::String')
  assert.match(result.code, /FixtureText::read\(\)/)
})

function fixtureLibrary(): CompilerLibraryDescriptor {
  return {
    id: 'fixture',
    dependencies: [],
    declarations: [],
    operations: [
      {
        libraryId: 'fixture',
        bindingId: 'global:readFixtureText',
        operationId: 'fixture#read-text',
        kind: 'call',
        runtimeRequirements: [],
        cExpression: 'FixtureText::read',
        cArgumentKinds: [],
        resultTypeRef: {
          kind: 'primitive',
          name: 'string',
          nullable: false,
          ownership: 'value',
          traits: []
        },
        cResultMapping: {
          cppType: 'inox::String',
          fields: []
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
