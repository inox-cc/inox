import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import {
  createCompilerLibrarySetWithConsole,
  fixtureNominalTypeRef
} from './helpers/compiler-library-fixtures.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'

test('native library type fields lower as C++ facade members', () => {
  const result = compileSource(
    'const entry = bridge.open()\nconsole.log(entry.size, entry.name)\n',
    { libraries: createCompilerLibrarySetWithConsole([bridgeLibrary()]), target: 'cc' }
  )

  assert.match(result.code, /bridge\.open\(\)/)
  assert.match(result.code, /entry\.size/)
  assert.match(result.code, /entry\.name/)
  assert.doesNotMatch(result.code, /inox::get\(entry,/)
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
        resultTypeRef: fixtureNominalTypeRef('bridge#Entry'),
        cResultMapping: { cppType: 'BridgeEntry', fields: [] }
      }
    ],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}
