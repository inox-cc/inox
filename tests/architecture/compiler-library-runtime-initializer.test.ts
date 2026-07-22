import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'
import { fixturePrimitiveTypeRef } from './helpers/compiler-library-fixtures.ts'

test('library options валидируются и формируют ordered runtime initializer', () => {
  const libraries = createCompilerLibrarySet([bridgeLibrary()])
  const result = compileSource('bridge()\n', {
    libraries,
    libraryOptions: [
      { optionId: 'global:bridge#seed', value: 7 },
      { optionId: 'global:bridge#mode', value: 'fast' }
    ]
  })

  assert.match(result.code, /#include "bridge\.h"/)
  assert.match(result.code, /inline BridgeRuntime bridge\(0x00000007u, BridgeMode::Fast\);/)
  assert.match(result.code, /bridge\.run\(\)/)
  assert.ok(
    result.code.indexOf('inline BridgeRuntime bridge(') < result.code.indexOf('bridge.run()')
  )
  assert.throws(
    () => compileSource('bridge()\n', {
      libraries,
      libraryOptions: [{ optionId: 'global:bridge#seed', value: -1 }]
    }),
    /global:bridge#seed must be an integer from 0 to 4294967295/
  )
})

function bridgeLibrary(): CompilerLibraryDescriptor {
  return {
    id: 'global:bridge',
    dependencies: [],
    declarations: [
      {
        libraryId: 'global:bridge',
        kind: 'global',
        source: 'stdlib/global/bridge/index.d.ts',
        declarationSource: 'export {}; declare global { function bridge(): number; }',
        compilerImplemented: true
      }
    ],
    options: [
      {
        libraryId: 'global:bridge',
        optionId: 'global:bridge#seed',
        cliAliases: ['--bridge-seed'],
        valueType: 'number',
        defaultValue: 1,
        integer: true,
        minimum: 0,
        maximum: 4294967295
      },
      {
        libraryId: 'global:bridge',
        optionId: 'global:bridge#mode',
        cliAliases: ['--bridge-mode'],
        valueType: 'string',
        defaultValue: 'safe',
        allowedValues: ['safe', 'fast']
      }
    ],
    runtimeInitializers: [
      {
        libraryId: 'global:bridge',
        initializerId: 'global:bridge#configure',
        runtimeRequirement: 'global:bridge',
        cType: 'BridgeRuntime',
        cName: 'bridge',
        arguments: [
          {
            optionId: 'global:bridge#seed',
            source: 'value',
            cValueKind: 'uint32-hex'
          },
          {
            optionId: 'global:bridge#mode',
            source: 'value',
            cValueKind: 'mapped',
            cValueMap: [
              { value: 'safe', cExpression: 'BridgeMode::Safe' },
              { value: 'fast', cExpression: 'BridgeMode::Fast' }
            ]
          }
        ]
      }
    ],
    operations: [
      {
        libraryId: 'global:bridge',
        bindingId: 'global:bridge',
        operationId: 'global:bridge#call',
        kind: 'call',
        runtimeRequirements: ['global:bridge'],
        cExpression: 'bridge.run',
        cArgumentKinds: [],
        resultTypeRef: fixturePrimitiveTypeRef('number')
      }
    ],
    intrinsicBindings: [],
    runtimeRequirements: [
      {
        id: 'global:bridge',
        dependencies: [],
        cPreludeIncludes: ['bridge.h'],
        capabilities: []
      }
    ]
  }
}
