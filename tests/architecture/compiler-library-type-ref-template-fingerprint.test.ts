import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'

test('library fingerprint учитывает TypeRef template parameters и traits', () => {
  const baseline = createCompilerLibrarySet([fixtureLibrary(['T', 'U'], 'T')]).fingerprint

  assert.equal(createCompilerLibrarySet([fixtureLibrary(['T', 'U'], 'T')]).fingerprint, baseline)
  assert.notEqual(createCompilerLibrarySet([fixtureLibrary(['U', 'T'], 'T')]).fingerprint, baseline)
  assert.notEqual(createCompilerLibrarySet([fixtureLibrary(['T', 'U'], 'U')]).fingerprint, baseline)
})

function fixtureLibrary(typeParameters: string[], traitParameterName: string): CompilerLibraryDescriptor {
  return {
    id: 'fixture',
    dependencies: [],
    declarations: [],
    nativeTypes: [
      {
        libraryId: 'fixture',
        typeId: 'fixture#Box',
        declarationNames: ['Box'],
        valueType: 'object',
        cppType: 'Box',
        baseTypeIds: [],
        runtimeRequirements: [],
        typeParameters,
        traits: [{ traitId: 'iterable', args: [{ kind: 'parameter', name: traitParameterName }] }]
      }
    ],
    operations: [],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}
