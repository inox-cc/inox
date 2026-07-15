import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor, TypeRef } from '../../compiler/extensions/types.ts'

test('builder ограничивает TypeRef parameters объявленным template scope', () => {
  const valid = createCompilerLibrarySet([fixtureLibrary(['T'], parameterTypeRef('T'))])

  assert.deepEqual(valid.nativeTypes[0].typeParameters, ['T'])
  assert.throws(() => createCompilerLibrarySet([fixtureLibrary(['T', 'T'], parameterTypeRef('T'))]), /duplicate type parameter T/)
  assert.throws(
    () => createCompilerLibrarySet([fixtureLibrary(['T'], parameterTypeRef('Missing'))]),
    /unknown type parameter Missing/
  )
  assert.throws(
    () => createCompilerLibrarySet([fixtureLibrary([], null, parameterTypeRef('T'))]),
    /type parameter T outside template scope/
  )
})

function fixtureLibrary(
  typeParameters: string[],
  traitArgument: TypeRef | null,
  operationResult: TypeRef | null = null
): CompilerLibraryDescriptor {
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
        traits: traitArgument === null ? [] : [{ traitId: 'iterable', args: [traitArgument] }]
      }
    ],
    operations:
      operationResult === null
        ? []
        : [
            {
              libraryId: 'fixture',
              bindingId: 'global:makeBox',
              operationId: 'fixture#make',
              kind: 'call',
              runtimeRequirements: [],
              resultTypeRef: operationResult
            }
          ],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}

function parameterTypeRef(name: string): TypeRef {
  return { kind: 'parameter', name }
}
