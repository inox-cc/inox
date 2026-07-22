import assert from 'node:assert/strict'
import test from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import {
  createCompilerLibrarySetWithConsole,
  fixtureNominalTypeRef,
  fixturePrimitiveTypeRef
} from './helpers/compiler-library-fixtures.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'

test('captured materializable library object сохраняет native receiver adapter', () => {
  const result = compileSource(
    `
const direct = bridge.open()
direct.close()

const handle = bridge.open()
bridge.listen(() => {
  handle.close(() => console.log('closed'))
})
`,
    { libraries: createCompilerLibrarySetWithConsole([bridgeLibrary()]), target: 'cc' }
  )

  assert.match(result.code, /BridgeHandle direct;/)
  assert.match(result.code, /direct\.close\(\)/)
  assert.match(result.code, /inox_value handle = captured->handle;/)
  assert.match(result.code, /BridgeHandle\(handle\)\.close\(inox_callback_\d+\)/)
  assert.doesNotMatch(result.code, /\binox_value handle = [^;]+;[\s\S]*\bhandle\.close\(/)
})

function bridgeLibrary(): CompilerLibraryDescriptor {
  const handleTypeId = 'bridge#Handle'

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
        minArgs: 0,
        maxArgs: 0,
        argumentChecks: [],
        resultTypeRef: fixtureNominalTypeRef(handleTypeId),
        cResultMapping: { cppType: 'BridgeHandle', fields: [] }
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
        minArgs: 1,
        maxArgs: 1,
        argumentChecks: [
          {
            valueTypes: ['function'],
            functionParameters: [],
            functionReturnType: 'void'
          }
        ],
        resultTypeRef: fixturePrimitiveTypeRef('void')
      },
      {
        libraryId: 'bridge',
        bindingId: `${handleTypeId}.close`,
        operationId: 'bridge#Handle.close',
        kind: 'call',
        runtimeRequirements: ['bridge'],
        receiverTypeId: handleTypeId,
        cExpression: 'close',
        cReceiverAdapter: 'BridgeHandle($value)',
        cCallStyle: 'member',
        cFailureMode: 'thrown',
        minArgs: 0,
        maxArgs: 1,
        argumentChecks: [
          {
            valueTypes: ['function'],
            functionParameters: [],
            functionReturnType: 'void'
          }
        ],
        variants: [
          {
            minArgs: 0,
            maxArgs: 0,
            cArgumentKinds: ['receiver']
          },
          {
            minArgs: 1,
            maxArgs: 1,
            cArgumentKinds: ['receiver', 'runtime-callback'],
            cArgumentSources: [null, { argumentIndex: 0 }],
            callbackLifetime: 'event-loop'
          }
        ],
        resultTypeRef: fixturePrimitiveTypeRef('void')
      }
    ],
    intrinsicBindings: [],
    runtimeRequirements: [
      {
        id: 'bridge',
        dependencies: ['callback-values', 'managed-values'],
        cPreludeIncludes: [],
        capabilities: []
      }
    ]
  }
}
