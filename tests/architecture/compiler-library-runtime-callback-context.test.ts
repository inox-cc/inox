import assert from 'node:assert/strict'
import test from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { createCompilerLibrarySetWithConsole } from './helpers/compiler-library-fixtures.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'

test('library callback metadata contextually types unannotated arrow parameters', () => {
  const result = compileSource(
    'bridge.listen((data, info) => { console.log(info.size) })\n',
    { libraries: createCompilerLibrarySetWithConsole([bridgeLibrary()]), target: 'cc' }
  )

  assert.match(result.code, /args\[0\]\.tag != INOX_TAG_BYTES/)
  assert.match(result.code, /inox_value data = args\[0\];/)
  assert.match(result.code, /inox_value info = args\[1\];/)
})

function bridgeLibrary(): CompilerLibraryDescriptor {
  return {
    id: 'bridge',
    dependencies: [],
    declarations: [],
    nativeTypes: [],
    operations: [
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
            functionParameters: [
              { name: 'data', valueType: 'bytes' },
              {
                name: 'info',
                valueType: 'object',
                shapeFields: [{ name: 'size', valueType: 'number', readonly: true }]
              }
            ],
            functionReturnType: 'void'
          }
        ],
        cppType: 'void',
        valueType: 'void'
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
