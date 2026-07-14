import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor, TypeRef } from '../../compiler/extensions/types.ts'

test('operation resultTypeRef reaches AST, HIR and generic C++ lowering', () => {
  const resultTypeRef = fixtureTypeRef()
  const libraries = createCompilerLibrarySet([fixtureLibrary(resultTypeRef)])
  const result = compileSource('const box = makeFixture()\n', { libraries, target: 'cc' })
  const astCall = result.ast.body[0].init
  const hirCall = result.hir.body[0].init

  assert.deepEqual(astCall.typeRef, resultTypeRef)
  assert.deepEqual(hirCall.typeRef, resultTypeRef)
  assert.equal(astCall.valueType, 'object')
  assert.equal(astCall.shape?.libraryTypeId, 'fixture#Box')
  assert.equal(astCall.shape?.libraryCppType, 'FixtureBox')
  assert.equal(astCall.libraryResultTypeId, 'fixture#Box')
  assert.equal(astCall.libraryCppType, 'FixtureBox')
  assert.equal(astCall.libraryOwned, true)
  assert.match(result.code, /auto inox_library_object_\d+ = FixtureBox::make\(\)/)
  assert.match(result.code, /box = inox_library_object_\d+/)
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
        declarationSource: 'export {}; declare global { function makeFixture(): unknown; }',
        compilerImplemented: true
      }
    ],
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
        cExpression: 'FixtureBox::make',
        cArgumentKinds: [],
        resultTypeRef,
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
    kind: 'nominal',
    typeId: 'fixture#Box',
    args: [
      {
        kind: 'primitive',
        name: 'string',
        nullable: false,
        ownership: 'value',
        traits: []
      }
    ],
    nullable: false,
    ownership: 'owned',
    traits: []
  }
}
