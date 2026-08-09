import assert from 'node:assert/strict'
import test from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'
import {
  createCompilerLibrarySetWithConsole,
  fixturePrimitiveTypeRef
} from './helpers/compiler-library-fixtures.ts'

test('package callback metadata сохраняет optional parameter до C++ wrapper', () => {
  const result = compileSource('bridge.read((value) => console.log(value === undefined))\n', {
    libraries: createCompilerLibrarySetWithConsole([bridgeLibrary()]),
    target: 'cc'
  })

  assert.match(result.code, /inox_callback_padded_args\[1\]/)
  assert.match(result.code, /inox_callback_args\[0\]\.tag != INOX_TAG_UNDEFINED/)
  assert.match(result.code, /\(value\.tag == INOX_TAG_UNDEFINED\)/)
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
        bindingId: 'global:bridge.read',
        operationId: 'bridge#read',
        kind: 'call',
        runtimeRequirements: ['bridge'],
        cExpression: 'bridge.read',
        cArgumentKinds: ['runtime-callback'],
        callbackLifetime: 'event-loop',
        minArgs: 1,
        maxArgs: 1,
        argumentChecks: [
          {
            valueTypes: ['function'],
            functionParameters: [{ name: 'value', valueType: 'string', optional: true }],
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
        dependencies: ['callback-values', 'managed-values'],
        cPreludeIncludes: [],
        capabilities: []
      }
    ]
  }
}
