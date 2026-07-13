import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'

test('library object options извлекают string и number поля с признаком наличия', () => {
  const libraries = createCompilerLibrarySet([bridgeLibrary()])
  const result = compileSource(
    "bridge.open({ host: '127.0.0.1', port: 8080 })\nbridge.open({})\n",
    { libraries, target: 'cc' }
  )

  assert.match(result.code, /bridge\.open\("127\.0\.0\.1", true, 8080(?:\.0)?, true\)/)
  assert.match(result.code, /bridge\.open\(inox::StringView\("", 0\), false, 0, false\)/)
})

function bridgeLibrary(): CompilerLibraryDescriptor {
  return {
    id: 'bridge',
    dependencies: [],
    declarations: [],
    operations: [
      {
        libraryId: 'bridge',
        bindingId: 'global:bridge.open',
        operationId: 'bridge#open',
        kind: 'call',
        runtimeRequirements: [],
        cExpression: 'bridge.open',
        cArgumentKinds: [
          'object-string-field',
          'argument-presence',
          'object-number-field',
          'argument-presence'
        ],
        cArgumentSources: [
          { argumentIndex: 0, objectFieldName: 'host' },
          null,
          { argumentIndex: 0, objectFieldName: 'port' },
          null
        ],
        minArgs: 1,
        maxArgs: 1,
        argumentChecks: [
          {
            valueTypes: ['object'],
            objectLiteralFields: [
              { name: 'host', valueTypes: ['string'], optional: true },
              { name: 'port', valueTypes: ['number'], optional: true }
            ]
          }
        ],
        cppType: 'void',
        valueType: 'void'
      }
    ],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}
