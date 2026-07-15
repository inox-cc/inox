import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor, TypeRef } from '../../compiler/extensions/types.ts'

test('builder проверяет arity только у явно generic native TypeRef', () => {
  assert.doesNotThrow(() => createCompilerLibrarySet([fixtureLibrary([primitiveTypeRef('string')])]))
  assert.throws(() => createCompilerLibrarySet([fixtureLibrary([])]), /expects 1 type argument\(s\), got 0/)
  assert.throws(
    () => createCompilerLibrarySet([fixtureLibrary([primitiveTypeRef('string'), primitiveTypeRef('number')])]),
    /expects 1 type argument\(s\), got 2/
  )
})

function fixtureLibrary(args: TypeRef[]): CompilerLibraryDescriptor {
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
        typeParameters: ['T']
      }
    ],
    operations: [
      {
        libraryId: 'fixture',
        bindingId: 'global:makeBox',
        operationId: 'fixture#make',
        kind: 'call',
        runtimeRequirements: [],
        resultTypeRef: {
          kind: 'nominal',
          typeId: 'fixture#Box',
          args,
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

function primitiveTypeRef(name: 'number' | 'string'): TypeRef {
  return { kind: 'primitive', name, nullable: false, ownership: 'value', traits: [] }
}
