import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'

test('runtime requirement references принимают core и объявленные cross-package IDs', () => {
  assert.throws(
    () => createCompilerLibrarySet([consumerLibrary(['missing-runtime'], [])]),
    /runtime requirement node:fixture references unknown dependency missing-runtime/
  )
  assert.throws(
    () => createCompilerLibrarySet([consumerLibrary([], ['global:missing'])]),
    /operation node:fixture#run references unknown runtime requirement global:missing/
  )
  assert.throws(
    () => createCompilerLibrarySet([consumerWithNativeRequirement('global:missing')]),
    /native type node:fixture#Value references unknown runtime requirement global:missing/
  )

  assert.doesNotThrow(() => createCompilerLibrarySet([
    binaryLibrary(),
    consumerLibrary(['global:binary', 'managed-values'], ['global:binary'])
  ]))
})

function binaryLibrary(): CompilerLibraryDescriptor {
  return {
    id: 'global:binary',
    dependencies: [],
    declarations: [],
    options: [],
    runtimeInitializers: [],
    nativeTypes: [],
    operations: [],
    intrinsicBindings: [],
    runtimeRequirements: [
      {
        id: 'global:binary',
        dependencies: ['collections', 'managed-values'],
        cPreludeIncludes: ['inox/binary.h'],
        capabilities: []
      }
    ]
  }
}

function consumerWithNativeRequirement(requirement: string): CompilerLibraryDescriptor {
  const library = consumerLibrary([], [])

  library.nativeTypes = [
    {
      libraryId: 'node:fixture',
      typeId: 'node:fixture#Value',
      declarationNames: ['FixtureValue'],
      valueType: 'object',
      cppType: 'FixtureValue',
      baseTypeIds: [],
      runtimeRequirements: [requirement]
    }
  ]
  return library
}

function consumerLibrary(
  dependencies: string[],
  operationRequirements: string[]
): CompilerLibraryDescriptor {
  return {
    id: 'node:fixture',
    dependencies: dependencies.includes('global:binary') ? ['global:binary'] : [],
    declarations: [],
    options: [],
    runtimeInitializers: [],
    nativeTypes: [],
    operations: operationRequirements.length === 0 ? [] : [
      {
        libraryId: 'node:fixture',
        bindingId: 'node:fixture#run',
        operationId: 'node:fixture#run',
        kind: 'call',
        runtimeRequirements: operationRequirements
      }
    ],
    intrinsicBindings: [],
    runtimeRequirements: [
      {
        id: 'node:fixture',
        dependencies,
        cPreludeIncludes: ['fixture.h'],
        capabilities: []
      }
    ]
  }
}
