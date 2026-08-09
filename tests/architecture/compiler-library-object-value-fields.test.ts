import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'
import {
  createCompilerLibrarySetWithSyntheticGlobalDeclarations as createCompilerLibrarySet,
  fixturePrimitiveTypeRef
} from './helpers/compiler-library-fixtures.ts'

test('library operation извлекает value-поля object literal без materialization объекта', () => {
  const result = compileSource(
    "const data = 'payload'\nbridge.use({ key: 'secret', label: 'context' }, data)\n" +
      "bridge.use({ key: 'secret' }, data)\n",
    { libraries: createCompilerLibrarySet([bridgeLibrary()]), target: 'cc' }
  )

  assert.match(
    result.code,
    /bridge\.use\(inox::String\("secret", 6\), inox::String\("context", 7\), true, inox::String\(data\)\)/
  )
  assert.match(
    result.code,
    /bridge\.use\(inox::String\("secret", 6\), inox_undefined_value\(\), false, inox::String\(data\)\)/
  )
})

function bridgeLibrary(): CompilerLibraryDescriptor {
  return {
    id: 'bridge',
    dependencies: [],
    declarations: [],
    operations: [
      {
        libraryId: 'bridge',
        bindingId: 'global:bridge.use',
        operationId: 'bridge#use',
        kind: 'call',
        runtimeRequirements: [],
        cExpression: 'bridge.use',
        cArgumentKinds: ['value', 'optional-value', 'argument-presence', 'value'],
        cArgumentSources: [
          { argumentIndex: 0, objectFieldName: 'key' },
          { argumentIndex: 0, objectFieldName: 'label' },
          null,
          { argumentIndex: 1 }
        ],
        minArgs: 2,
        maxArgs: 2,
        argumentChecks: [
          {
            valueTypes: ['object'],
            objectLiteralFields: [
              { name: 'key', valueTypes: ['string'] },
              { name: 'label', valueTypes: ['string'], optional: true }
            ]
          },
          { valueTypes: ['string'] }
        ],
        resultTypeRef: fixturePrimitiveTypeRef('void')
      }
    ],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}
