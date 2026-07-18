import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { createCompilerLibrarySetWithSyntheticGlobalDeclarations as createCompilerLibrarySet } from './helpers/compiler-library-fixtures.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'

test('primitive void TypeRef reaches generic C++ operation lowering', () => {
  const libraries = createCompilerLibrarySet([fixtureLibrary()])
  const result = compileSource('finishFixture()\n', { libraries, target: 'cc' })
  const call = result.hir.body[0].expression

  assert.equal(call.valueType, 'void')
  assert.equal(call.libraryOperationId, 'fixture#finish')
  assert.match(result.code, /Fixture::finish\(\);/)
  assert.doesNotMatch(result.code, /\bfinishFixture\(\);/)
})

function fixtureLibrary(): CompilerLibraryDescriptor {
  return {
    id: 'fixture',
    dependencies: [],
    declarations: [],
    operations: [
      {
        libraryId: 'fixture',
        bindingId: 'global:finishFixture',
        operationId: 'fixture#finish',
        kind: 'call',
        runtimeRequirements: [],
        cExpression: 'Fixture::finish',
        cArgumentKinds: [],
        resultTypeRef: {
          kind: 'primitive',
          name: 'void',
          nullable: false,
          ownership: 'value',
          traits: []
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
