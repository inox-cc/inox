import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { createCompilerLibrarySetWithSyntheticGlobalDeclarations as createCompilerLibrarySet } from './helpers/compiler-library-fixtures.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'

const handleTypeId = 'bridge#Handle'

test('captured native handle проходит через generic runtime callback argument adapter', () => {
  const result = compileSource(
    `
const handle = bridge.open()
bridge.listen(() => {
  bridge.release(handle)
})
`,
    { libraries: createCompilerLibrarySet([bridgeLibrary()]), target: 'cc' }
  )
  const openCall = result.ir.body[0].init
  const listenCall = result.ir.body[1].expression
  const releaseCall = listenCall.args[0].body[0].expression
  const serializedIr = JSON.stringify(result.ir)

  assert.equal(openCall.libraryResultTypeId, handleTypeId)
  assert.equal(listenCall.libraryCallbackLifetime, 'event-loop')
  assert.equal(releaseCall.libraryOperationId, 'bridge#release')
  assert.deepEqual(releaseCall.libraryCArgumentKinds, ['value'])
  assert.deepEqual(releaseCall.libraryCArgumentAdapters, ['BridgeHandle($value)'])
  assert.doesNotMatch(serializedIr, /timerRuntimeMethod|"valueType":"timer"/)
  assert.match(result.code, /inox_value handle = captured->handle;/)
  assert.match(result.code, /bridge\.release\(BridgeHandle\(handle\)\)/)
  assert.doesNotMatch(result.code, /inox_timer_handle|inox_loop_(?:clear|set)_timer/)
})

function bridgeLibrary(): CompilerLibraryDescriptor {
  return {
    id: 'bridge',
    dependencies: [],
    declarations: [],
    nativeTypes: [
      {
        libraryId: 'bridge',
        typeId: handleTypeId,
        declarationNames: ['Handle'],
        valueType: 'object',
        cppType: 'BridgeHandle',
        baseTypeIds: [],
        runtimeRequirements: ['bridge']
      }
    ],
    operations: [
      {
        libraryId: 'bridge',
        bindingId: 'global:bridge.open',
        operationId: 'bridge#open',
        kind: 'call',
        runtimeRequirements: ['bridge'],
        cExpression: 'bridge.open',
        cArgumentKinds: [],
        resultTypeId: handleTypeId,
        cppType: 'BridgeHandle',
        valueType: 'object',
        nullable: false,
        owned: false
      },
      {
        libraryId: 'bridge',
        bindingId: 'global:bridge.listen',
        operationId: 'bridge#listen',
        kind: 'call',
        runtimeRequirements: ['bridge'],
        cExpression: 'bridge.listen',
        cArgumentKinds: ['runtime-callback'],
        cArgumentSources: [{ argumentIndex: 0 }],
        callbackLifetime: 'event-loop',
        argumentChecks: [
          {
            valueTypes: ['function'],
            functionParameters: [],
            functionReturnType: 'void'
          }
        ],
        cppType: 'void',
        valueType: 'void'
      },
      {
        libraryId: 'bridge',
        bindingId: 'global:bridge.release',
        operationId: 'bridge#release',
        kind: 'call',
        runtimeRequirements: ['bridge'],
        cExpression: 'bridge.release',
        cArgumentKinds: ['value'],
        cArgumentAdapters: ['BridgeHandle($value)'],
        argumentChecks: [{ valueTypes: ['object'], objectTypeIds: [handleTypeId] }],
        cppType: 'void',
        valueType: 'void'
      }
    ],
    intrinsicBindings: [],
    runtimeRequirements: [
      {
        id: 'bridge',
        dependencies: ['callback-values', 'managed-values', 'objects'],
        cPreludeIncludes: [],
        capabilities: []
      }
    ]
  }
}
