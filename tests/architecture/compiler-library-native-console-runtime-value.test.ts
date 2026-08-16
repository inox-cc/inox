import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'
import {
  createCompilerLibrarySetWithConsole,
  fixtureNominalTypeRef
} from './helpers/compiler-library-fixtures.ts'

test('console materializes direct native library values through their runtime value expression', () => {
  const result = compileSource('const value = bridge.open()\nconsole.log(value)\n', {
    libraries: createCompilerLibrarySetWithConsole([bridgeLibrary()]),
    target: 'cc'
  })

  assert.match(result.code, /auto inox_library_object_\d+ = bridge\.open\(\);/)
  assert.match(result.code, /auto inox_runtime_value_\d+ = inox::adopt\(value\.runtimeValue\(\)\.release\(\)\);/)
  assert.match(result.code, /console\.log\(inox_runtime_value_\d+\);/)
  assert.doesNotMatch(result.code, /console\.log\(value\);/)
})

function bridgeLibrary(): CompilerLibraryDescriptor {
  return {
    id: 'bridge',
    dependencies: [],
    declarations: [],
    nativeTypes: [
      {
        libraryId: 'bridge',
        typeId: 'bridge#Value',
        declarationNames: ['BridgeValue'],
        valueType: 'object',
        cppType: 'BridgeValue',
        baseTypeIds: [],
        runtimeRequirements: [],
        cRuntimeValueExpression: '$value.runtimeValue().release()',
        cRuntimeValueOwnership: 'owned'
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
        resultTypeRef: fixtureNominalTypeRef('bridge#Value'),
        cResultMapping: { cppType: 'BridgeValue', fields: [] }
      }
    ],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}
