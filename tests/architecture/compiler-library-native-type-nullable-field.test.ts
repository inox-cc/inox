import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSourceToIr } from '../../compiler/core.ts'
import { createCompilerLibrarySetWithConsole } from './helpers/compiler-library-fixtures.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'

test('native type field сохраняет nullable metadata и fingerprint', () => {
  const libraries = createCompilerLibrarySetWithConsole([fixtureLibrary(true)])
  const result = compileSourceToIr('const value = fixture.failure()\nconsole.log(value.cause)\n', {
    libraries
  })
  const cause = result.ir.body[1].expression.args[0]

  assert.equal(cause.valueType, 'object')
  assert.equal(cause.nullable, true)
  assert.notEqual(libraries.fingerprint, createCompilerLibrarySetWithConsole([fixtureLibrary(false)]).fingerprint)
})

function fixtureLibrary(nullable: boolean): CompilerLibraryDescriptor {
  return {
    id: 'fixture',
    dependencies: [],
    declarations: [],
    nativeTypes: [
      {
        libraryId: 'fixture',
        typeId: 'fixture#Error',
        declarationNames: ['FixtureError'],
        valueType: 'error',
        cppType: 'inox::Value',
        baseTypeIds: [],
        runtimeRequirements: [],
        fields: [{ name: 'cause', valueType: 'object', nullable, readonly: true }]
      }
    ],
    operations: [
      {
        libraryId: 'fixture',
        bindingId: 'global:fixture.failure',
        operationId: 'fixture#failure',
        kind: 'call',
        runtimeRequirements: [],
        cExpression: 'fixture.failure',
        cArgumentKinds: [],
        minArgs: 0,
        maxArgs: 0,
        argumentChecks: [],
        resultTypeRef: {
          kind: 'nominal',
          typeId: 'fixture#Error',
          args: [],
          nullable: false,
          ownership: 'value',
          traits: []
        }
      }
    ],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}
