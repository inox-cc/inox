import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type {
  CompilerLibraryDescriptor,
  LibraryOptionConditionDescriptor
} from '../../compiler/extensions/types.ts'

test('conditional capability conditions соответствуют option source и domain', () => {
  assert.throws(
    () => createCompilerLibrarySet([fixtureLibrary({
      optionId: 'global:fixture#missing',
      source: 'value',
      values: ['safe']
    })]),
    /references missing option global:fixture#missing/
  )
  assert.throws(
    () => createCompilerLibrarySet([fixtureLibrary({
      optionId: 'global:fixture#mode',
      source: 'present',
      values: ['true']
    })]),
    /present condition expects boolean values/
  )
  assert.throws(
    () => createCompilerLibrarySet([fixtureLibrary({
      optionId: 'global:fixture#mode',
      source: 'value',
      values: [1]
    })]),
    /condition value 1 expects string/
  )
  assert.throws(
    () => createCompilerLibrarySet([fixtureLibrary({
      optionId: 'global:fixture#mode',
      source: 'value',
      values: ['unknown']
    })]),
    /expects one of safe, fast/
  )

  assert.doesNotThrow(() => createCompilerLibrarySet([fixtureLibrary({
    optionId: 'global:fixture#mode',
    source: 'value',
    values: ['fast']
  })]))
})

function fixtureLibrary(condition: LibraryOptionConditionDescriptor): CompilerLibraryDescriptor {
  return {
    id: 'global:fixture',
    dependencies: [],
    declarations: [],
    options: [
      {
        libraryId: 'global:fixture',
        optionId: 'global:fixture#mode',
        cliAliases: [],
        valueType: 'string',
        defaultValue: 'safe',
        allowedValues: ['safe', 'fast']
      }
    ],
    runtimeInitializers: [],
    nativeTypes: [],
    operations: [],
    intrinsicBindings: [],
    runtimeRequirements: [
      {
        id: 'global:fixture',
        dependencies: [],
        cPreludeIncludes: [],
        capabilities: [],
        conditionalCapabilities: [
          {
            capability: 'fixture-capability',
            conditions: [condition]
          }
        ]
      }
    ]
  }
}
