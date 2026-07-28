import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createCompilerLibrarySetWithConsole, fixtureNominalTypeRef } from './helpers/compiler-library-fixtures.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'

test('native library type fields require an explicit C++ access path', () => {
  assert.throws(() => createCompilerLibrarySetWithConsole([bridgeLibrary()]), {
    message: 'native type field bridge#Entry.size requires exactly one C++ cMember or cGetter'
  })
})

function bridgeLibrary(): CompilerLibraryDescriptor {
  return {
    id: 'bridge',
    dependencies: [],
    declarations: [],
    nativeTypes: [
      {
        libraryId: 'bridge',
        typeId: 'bridge#Entry',
        declarationNames: ['BridgeEntry'],
        valueType: 'object',
        cppType: 'BridgeEntry',
        baseTypeIds: [],
        runtimeRequirements: [],
        fields: [{ name: 'size', valueType: 'number', readonly: true }]
      }
    ],
    operations: [
      {
        libraryId: 'bridge',
        bindingId: 'global:bridge.open',
        operationId: 'bridge#open',
        kind: 'call',
        runtimeRequirements: [],
        cExpression: 'bridge.open',
        cArgumentKinds: [],
        resultTypeRef: fixtureNominalTypeRef('bridge#Entry'),
        cResultMapping: { cppType: 'BridgeEntry', fields: [] }
      }
    ],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}
