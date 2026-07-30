import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSourceToIr } from '../../compiler/core.ts'
import { createCompilerLibrarySetWithConsole } from './helpers/compiler-library-fixtures.ts'
import type { CompilerLibraryDescriptor, TypeRef } from '../../compiler/extensions/types.ts'
import { arrayTypeRef } from '../../stdlib/global/collections/compiler/index.ts'
import {
  compilerLibraryPackage as errorCompilerLibraryPackage,
  errorTypeRef
} from '../../stdlib/global/error/compiler/index.ts'
import {
  compilerLibraryPackage as promiseCompilerLibraryPackage,
  promiseTypeRef
} from '../../stdlib/global/promise/compiler/index.ts'

test('native type fields come only from library metadata', () => {
  const result = compileSourceToIr(
    'function entryName(entry: FixtureEntry): string { return entry.name }\n' +
      'const entries = await fixture.list()\n' +
      'const entry = entries[0]\n' +
      'if (entry) { console.log(entry.name, entry.size) }\n',
    { libraries: nativeFieldLibrarySet() }
  )

  const parameterField = result.ir.body[0].body[0].argument
  const entry = result.ir.body[2].init
  const log = result.ir.body[3].consequent.body[0].expression
  const nameField = log.args[0]
  const sizeField = log.args[1]

  assert.equal(parameterField.valueType, 'string')
  assert.equal(entry.shape.libraryTypeId, 'fixture#Entry')
  assert.equal(nameField.valueType, 'string')
  assert.equal(sizeField.valueType, 'number')

  const changed = nativeFieldLibrary()
  const nativeTypes = changed.nativeTypes ?? []
  const fields = nativeTypes[0].fields ?? []
  fields[0].readonly = false

  assert.notEqual(nativeFieldLibrarySet(changed).fingerprint, nativeFieldLibrarySet(nativeFieldLibrary()).fingerprint)
})

function nativeFieldLibrary(): CompilerLibraryDescriptor {
  return {
    id: 'fixture',
    dependencies: [],
    declarations: [],
    nativeTypes: [
      {
        libraryId: 'fixture',
        typeId: 'fixture#Entry',
        declarationNames: ['FixtureEntry'],
        valueType: 'object',
        cppType: 'FixtureEntry',
        baseTypeIds: [],
        runtimeRequirements: [],
        fields: [
          { name: 'name', valueType: 'string', readonly: true, cMember: 'name' },
          { name: 'size', valueType: 'number', readonly: true, cMember: 'size' }
        ]
      }
    ],
    operations: [
      {
        libraryId: 'fixture',
        bindingId: 'global:fixture.list',
        operationId: 'fixture#list',
        kind: 'call',
        runtimeRequirements: [],
        cExpression: 'fixture.list',
        cArgumentKinds: [],
        minArgs: 0,
        maxArgs: 0,
        argumentChecks: [],
        resultTypeRef: promiseTypeRef(arrayTypeRef(fixtureEntryTypeRef()), errorTypeRef())
      }
    ],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}

function nativeFieldLibrarySet(library: CompilerLibraryDescriptor = nativeFieldLibrary()) {
  return createCompilerLibrarySetWithConsole([
    { ...errorCompilerLibraryPackage, declarations: [] },
    { ...promiseCompilerLibraryPackage, declarations: [] },
    library
  ])
}

function fixtureEntryTypeRef(): TypeRef {
  return {
    kind: 'nominal',
    typeId: 'fixture#Entry',
    args: [],
    nullable: false,
    ownership: 'value',
    traits: []
  }
}
