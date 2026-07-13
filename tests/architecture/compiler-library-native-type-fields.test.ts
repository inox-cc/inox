import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSourceToIr } from '../../compiler/core.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'

test('native type fields come only from library metadata', () => {
  const result = compileSourceToIr(
    'function entryName(entry: FixtureEntry): string { return entry.name }\n' +
      'const entries = await fixture.list()\n' +
      'const entry = entries[0]\n' +
      'console.log(entry.name, entry.size)\n',
    { libraries: createCompilerLibrarySet([nativeFieldLibrary()]) }
  )

  const parameterField = result.ir.body[0].body[0].argument
  const entry = result.ir.body[2].init
  const nameField = result.ir.body[3].expression.args[0]
  const sizeField = result.ir.body[3].expression.args[1]

  assert.equal(parameterField.valueType, 'string')
  assert.equal(entry.shape.libraryTypeId, 'fixture#Entry')
  assert.equal(nameField.valueType, 'string')
  assert.equal(sizeField.valueType, 'number')

  const changed = nativeFieldLibrary()
  const nativeTypes = changed.nativeTypes ?? []
  const fields = nativeTypes[0].fields ?? []
  fields[0].readonly = false

  assert.notEqual(
    createCompilerLibrarySet([changed]).fingerprint,
    createCompilerLibrarySet([nativeFieldLibrary()]).fingerprint
  )
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
          { name: 'name', valueType: 'string', readonly: true },
          { name: 'size', valueType: 'number', readonly: true }
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
        resultArrayElementType: 'object',
        resultArrayElementTypeId: 'fixture#Entry',
        cppType: 'inox::Promise',
        valueType: 'promise',
        promiseValueType: 'array',
        promiseRejectionValueType: 'error'
      }
    ],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}
