import assert from 'node:assert/strict'
import test from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import {
  createCompilerLibrarySetWithConsole,
  fixturePrimitiveTypeRef
} from './helpers/compiler-library-fixtures.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'

test('library callback descriptor поддерживает nullable object параметры', () => {
  const source = "bridge.run((error) => { if (error) console.log(error.message) })\n"
  const result = compileSource(source, { libraries: createCompilerLibrarySetWithConsole([bridgeLibrary()]), target: 'cc' })

  assert.match(result.code, /inox_callback_args\[0\]\.tag != INOX_TAG_NULL &&/)
  assert.match(result.code, /inox_value error = inox_callback_args\[0\];/)
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
        bindingId: 'global:bridge.run',
        operationId: 'bridge#run',
        kind: 'call',
        runtimeRequirements: ['bridge'],
        cExpression: 'bridge.run',
        cArgumentKinds: ['runtime-callback'],
        cArgumentSources: [{ argumentIndex: 0 }],
        callbackLifetime: 'event-loop',
        minArgs: 1,
        maxArgs: 1,
        argumentChecks: [
          {
            valueTypes: ['function'],
            functionParameters: [
              {
                name: 'error',
                valueType: 'object',
                nullable: true,
                shapeFields: [{ name: 'message', valueType: 'string', readonly: true }]
              }
            ],
            functionReturnType: 'void'
          }
        ],
        resultTypeRef: fixturePrimitiveTypeRef('void')
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
