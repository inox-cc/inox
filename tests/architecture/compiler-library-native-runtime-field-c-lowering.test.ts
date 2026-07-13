import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'

test('native library type fields stay runtime-backed without cMember metadata', () => {
  const result = compileSource(
    'const entry = bridge.open()\nconsole.log(entry.size)\n',
    { libraries: createCompilerLibrarySet([bridgeLibrary()]), target: 'cc' }
  )

  assert.match(result.code, /inox::get\(entry, "size"\)/)
  assert.doesNotMatch(result.code, /console\.log\("%.17g", \(\(double\)entry\.size\)\)/)
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
        resultTypeId: 'bridge#Entry',
        cppType: 'BridgeEntry',
        valueType: 'object'
      }
    ],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}
