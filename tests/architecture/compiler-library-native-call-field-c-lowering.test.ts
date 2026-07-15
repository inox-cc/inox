import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { createCompilerLibrarySetWithConsole } from './helpers/compiler-library-fixtures.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'

test('native library result fields lower directly on call expressions', () => {
  const result = compileSource(
    'console.log(bridge.open().size, bridge.open().name)\n',
    { libraries: createCompilerLibrarySetWithConsole([bridgeLibrary()]), target: 'cc' }
  )

  assert.match(result.code, /auto inox_library_object_\d+ = bridge\.open\(\);/)
  assert.match(result.code, /\(inox_library_object_\d+\)\.size/)
  assert.match(result.code, /\(inox_library_object_\d+\)\.name/)
  assert.doesNotMatch(result.code, /inox::get\(/)
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
        fields: [
          { name: 'size', valueType: 'number', readonly: true, cMember: 'size' },
          { name: 'name', valueType: 'string', readonly: true, cMember: 'name' }
        ]
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
        resultTypeId: 'bridge#Entry',
        cppType: 'BridgeEntry',
        valueType: 'object'
      }
    ],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}
