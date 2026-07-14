import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type {
  CompilerLibraryDescriptor,
  LibraryRuntimeInitializerDescriptor
} from '../../compiler/extensions/types.ts'

test('runtime initializer descriptor валидирует C++ argument mapping и имена definitions', () => {
  assert.throws(
    () => createCompilerLibrarySet([fixtureLibrary([
      initializer('global:fixture#bad-kind', 'badKind', [
        { optionId: 'global:fixture#seed', source: 'value', cValueKind: 'boolean' }
      ])
    ])]),
    /initializer global:fixture#bad-kind boolean argument requires boolean option/
  )
  assert.throws(
    () => createCompilerLibrarySet([fixtureLibrary([
      initializer('global:fixture#bad-uint32', 'badUint32', [
        { optionId: 'global:fixture#free-number', source: 'value', cValueKind: 'uint32-hex' }
      ])
    ])]),
    /initializer global:fixture#bad-uint32 uint32-hex option must constrain integers from 0 to 4294967295/
  )
  assert.throws(
    () => createCompilerLibrarySet([fixtureLibrary([
      initializer('global:fixture#incomplete-map', 'incompleteMap', [
        {
          optionId: 'global:fixture#mode',
          source: 'value',
          cValueKind: 'mapped',
          cValueMap: [{ value: 'safe', cExpression: 'Mode::Safe' }]
        }
      ])
    ])]),
    /initializer global:fixture#incomplete-map has no C\+\+ mapping for fast/
  )
  assert.throws(
    () => createCompilerLibrarySet([fixtureLibrary([
      initializer('global:fixture#first', 'fixtureRuntime', []),
      initializer('global:fixture#second', 'fixtureRuntime', [])
    ])]),
    /duplicate compiler library runtime initializer C\+\+ name fixtureRuntime/
  )
})

function fixtureLibrary(
  runtimeInitializers: LibraryRuntimeInitializerDescriptor[]
): CompilerLibraryDescriptor {
  return {
    id: 'global:fixture',
    dependencies: [],
    declarations: [],
    options: [
      {
        libraryId: 'global:fixture',
        optionId: 'global:fixture#seed',
        cliAliases: [],
        valueType: 'number',
        defaultValue: 1,
        integer: true,
        minimum: 0,
        maximum: 4294967295
      },
      {
        libraryId: 'global:fixture',
        optionId: 'global:fixture#free-number',
        cliAliases: [],
        valueType: 'number',
        defaultValue: 1
      },
      {
        libraryId: 'global:fixture',
        optionId: 'global:fixture#mode',
        cliAliases: [],
        valueType: 'string',
        defaultValue: 'safe',
        allowedValues: ['safe', 'fast']
      }
    ],
    runtimeInitializers,
    nativeTypes: [],
    operations: [],
    intrinsicBindings: [],
    runtimeRequirements: [
      {
        id: 'global:fixture',
        dependencies: [],
        cPreludeIncludes: ['fixture.h'],
        capabilities: []
      }
    ]
  }
}

function initializer(
  initializerId: string,
  cName: string,
  argumentsList: LibraryRuntimeInitializerDescriptor['arguments']
): LibraryRuntimeInitializerDescriptor {
  return {
    libraryId: 'global:fixture',
    initializerId,
    runtimeRequirement: 'global:fixture',
    cType: 'FixtureRuntime',
    cName,
    arguments: argumentsList
  }
}
