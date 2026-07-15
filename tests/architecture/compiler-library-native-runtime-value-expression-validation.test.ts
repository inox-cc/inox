import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'

test('native runtime value expression is validated and included in the library fingerprint', () => {
  const library = fixtureLibrary('$value.raw()')
  const fingerprint = createCompilerLibrarySet([library]).fingerprint

  assert.notEqual(createCompilerLibrarySet([fixtureLibrary('$value.value()')]).fingerprint, fingerprint)
  assert.throws(
    () => createCompilerLibrarySet([fixtureLibrary('fixture.raw()')]),
    /native type fixture#Value C\+\+ runtime value expression requires \$value/
  )
})

function fixtureLibrary(cRuntimeValueExpression: string): CompilerLibraryDescriptor {
  return {
    id: 'fixture',
    dependencies: [],
    declarations: [],
    nativeTypes: [
      {
        libraryId: 'fixture',
        typeId: 'fixture#Value',
        declarationNames: ['FixtureValue'],
        valueType: 'object',
        cppType: 'FixtureValue',
        baseTypeIds: [],
        runtimeRequirements: [],
        cRuntimeValueExpression
      }
    ],
    operations: [],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}
