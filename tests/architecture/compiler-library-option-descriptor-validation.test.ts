import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type {
  CompilerLibraryDescriptor,
  LibraryOptionDescriptor
} from '../../compiler/extensions/types.ts'

test('option descriptor отклоняет недостижимые CLI aliases и несогласованные значения', () => {
  assert.throws(
    () => createCompilerLibrarySet([libraryWithOption({ ...validOption(), cliAliases: ['seed'] })]),
    /CLI alias seed must start with -/
  )
  assert.throws(
    () => createCompilerLibrarySet([libraryWithOption({ ...validOption(), cliAliases: ['--emit'] })]),
    /CLI alias --emit is reserved/
  )
  assert.throws(
    () => createCompilerLibrarySet([libraryWithOption({
      ...validOption(),
      allowedValues: ['safe', 1]
    })]),
    /allowed value 1 expects string/
  )
  assert.throws(
    () => createCompilerLibrarySet([libraryWithOption({
      ...validOption(),
      valueType: 'number',
      defaultValue: 5,
      allowedValues: undefined,
      integer: true,
      minimum: 10,
      maximum: 1
    })]),
    /minimum 10 exceeds maximum 1/
  )
  assert.throws(
    () => createCompilerLibrarySet([libraryWithOption({
      ...validOption(),
      valueType: 'number',
      defaultValue: Number.POSITIVE_INFINITY,
      allowedValues: undefined
    })]),
    /invalid numeric value/
  )
  assert.throws(
    () => createCompilerLibrarySet([libraryWithOption({
      ...validOption(),
      libraryId: 'global:other'
    })]),
    /option global:fixture#mode is owned by global:other, expected global:fixture/
  )
})

function validOption(): LibraryOptionDescriptor {
  return {
    libraryId: 'global:fixture',
    optionId: 'global:fixture#mode',
    cliAliases: ['--fixture-mode'],
    valueType: 'string',
    defaultValue: 'safe',
    allowedValues: ['safe', 'fast']
  }
}

function libraryWithOption(option: LibraryOptionDescriptor): CompilerLibraryDescriptor {
  return {
    id: 'global:fixture',
    dependencies: [],
    declarations: [],
    options: [option],
    runtimeInitializers: [],
    nativeTypes: [],
    operations: [],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}
