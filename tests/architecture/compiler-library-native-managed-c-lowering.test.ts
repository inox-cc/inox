import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import {
  createCompilerLibrarySetWithSyntheticGlobalDeclarations as createCompilerLibrarySet,
  fixtureNominalTypeRef
} from './helpers/compiler-library-fixtures.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'

test('managed native library values lower without C++ type name cases in core', () => {
  const result = compileSource(
    'function makeBytes(): NativeBytes {\n' +
      '  const value = api.make()\n' +
      '  let copy: NativeBytes = value\n' +
      '  copy = api.make()\n' +
      '  return copy\n' +
      '}\n',
    { libraries: createCompilerLibrarySet([nativeLibrary()]), target: 'cc' }
  )

  assert.match(result.code, /auto value = api\.make\(\)/)
  assert.match(result.code, /auto copy = value/)
  assert.match(result.code, /copy = api\.make\(\)/)
  assert.match(result.code, /NativeBytes makeBytes\(\)/)
  assert.match(result.code, /inox_return = copy/)
  assert.doesNotMatch(result.code, /Buffer|Uint8Array/)
})

function nativeLibrary(): CompilerLibraryDescriptor {
  return {
    id: 'native',
    dependencies: [],
    declarations: [],
    nativeTypes: [
      {
        libraryId: 'native',
        typeId: 'native#Bytes',
        declarationNames: ['NativeBytes'],
        valueType: 'bytes',
        cppType: 'NativeBytes',
        baseTypeIds: [],
        runtimeRequirements: ['native'],
        cValueAdapter: 'NativeBytes($value)'
      }
    ],
    operations: [
      {
        libraryId: 'native',
        bindingId: 'global:api.make',
        operationId: 'native#make',
        kind: 'call',
        runtimeRequirements: ['native'],
        cExpression: 'api.make',
        cArgumentKinds: [],
        resultTypeRef: fixtureNominalTypeRef('native#Bytes'),
        cResultMapping: { cppType: 'NativeBytes', fields: [] },
        minArgs: 0,
        maxArgs: 0,
        argumentChecks: []
      }
    ],
    intrinsicBindings: [],
    runtimeRequirements: [
      {
        id: 'native',
        dependencies: ['managed-values'],
        cPreludeIncludes: ['native.h'],
        capabilities: []
      }
    ]
  }
}
