import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { createCompilerLibrarySetWithSyntheticGlobalDeclarations as createCompilerLibrarySet } from './helpers/compiler-library-fixtures.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'

test('library C arguments поддерживают templates и string-view-or-value lowering', () => {
  const result = compileSource(
    "const payload = { ok: true }\nbridge.take(3)\nbridge.accept('text')\nbridge.accept(payload)\nbridge.box.touch()\nbridge.box.accept(3)\n",
    { libraries: createCompilerLibrarySet([bridgeLibrary()]), target: 'cc' }
  )

  assert.match(result.code, /bridge\.take\(static_cast<int>\(3(?:\.0)?\)\)/)
  assert.match(result.code, /bridge\.accept\("text"\)/)
  assert.match(result.code, /bridge\.accept\(inox::Value\(payload\)\)/)
  assert.match(result.code, /BridgeBox\(inox_value_\d+\)\.touch\(\)/)
  assert.match(result.code, /BridgeBox\(inox_value_\d+\)\.accept\(static_cast<int>\(3(?:\.0)?\)\)/)
})

function bridgeLibrary(): CompilerLibraryDescriptor {
  return {
    id: 'bridge',
    dependencies: [],
    declarations: [
      {
        libraryId: 'bridge',
        kind: 'global',
        source: 'tests/architecture/fixtures/bridge-argument-adapters.d.ts',
        declarationSource: `
          export {}
          declare global {
            interface BridgeBox {
              touch(): void;
              accept(value: unknown): void;
            }
            interface Bridge {
              take(value: unknown): void;
              accept(value: unknown): void;
              readonly box: BridgeBox;
            }
            const bridge: Bridge;
          }
        `,
        compilerImplemented: true
      }
    ],
    nativeTypes: [
      {
        libraryId: 'bridge',
        typeId: 'bridge#Box',
        declarationNames: ['BridgeBox'],
        valueType: 'object',
        cppType: 'BridgeBox',
        baseTypeIds: [],
        runtimeRequirements: [],
        fields: [
          { name: 'touch', valueType: 'function', readonly: true },
          { name: 'accept', valueType: 'function', readonly: true }
        ]
      }
    ],
    operations: [
      {
        libraryId: 'bridge',
        bindingId: 'global:bridge',
        operationId: 'bridge#global',
        kind: 'member-read',
        runtimeRequirements: [],
        cExpression: 'bridge',
        resultShapeFields: [
          {
            name: 'box',
            valueType: 'object',
            readonly: true,
            resultTypeId: 'bridge#Box',
            resultShapeFields: [
              { name: 'touch', valueType: 'function', readonly: true },
              { name: 'accept', valueType: 'function', readonly: true }
            ],
            cppType: 'BridgeBox'
          }
        ],
        cppType: 'Bridge',
        valueType: 'object'
      },
      {
        libraryId: 'bridge',
        bindingId: 'bridge#Box.touch',
        operationId: 'bridge#Box.touch',
        kind: 'call',
        runtimeRequirements: [],
        receiverTypeId: 'bridge#Box',
        cExpression: 'touch',
        cCallStyle: 'member',
        cArgumentKinds: ['receiver'],
        cReceiverAdapter: 'BridgeBox($value)',
        minArgs: 0,
        maxArgs: 0,
        argumentChecks: [],
        cppType: 'void',
        valueType: 'void'
      },
      {
        libraryId: 'bridge',
        bindingId: 'bridge#Box.accept',
        operationId: 'bridge#Box.accept',
        kind: 'call',
        runtimeRequirements: [],
        receiverTypeId: 'bridge#Box',
        cExpression: 'accept',
        cCallStyle: 'member',
        cArgumentKinds: ['receiver', 'number'],
        cArgumentAdapters: ['static_cast<int>($value)'],
        cReceiverAdapter: 'BridgeBox($value)',
        minArgs: 1,
        maxArgs: 1,
        argumentChecks: [{ valueTypes: ['number'] }],
        cppType: 'void',
        valueType: 'void'
      },
      {
        libraryId: 'bridge',
        bindingId: 'global:bridge.take',
        operationId: 'bridge#take',
        kind: 'call',
        runtimeRequirements: [],
        cExpression: 'bridge.take',
        cArgumentKinds: ['number'],
        cArgumentAdapters: ['static_cast<int>($value)'],
        minArgs: 1,
        maxArgs: 1,
        argumentChecks: [{ valueTypes: ['number'] }],
        cppType: 'void',
        valueType: 'void'
      },
      {
        libraryId: 'bridge',
        bindingId: 'global:bridge.accept',
        operationId: 'bridge#accept',
        kind: 'call',
        runtimeRequirements: [],
        cExpression: 'bridge.accept',
        cArgumentKinds: ['string-view-or-value'],
        cArgumentAdapters: ['$value'],
        minArgs: 1,
        maxArgs: 1,
        argumentChecks: [{ valueTypes: ['string', 'object'] }],
        cppType: 'void',
        valueType: 'void'
      }
    ],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}
