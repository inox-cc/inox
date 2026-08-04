import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { createCompilerLibrarySetWithConsole, fixturePrimitiveTypeRef } from './helpers/compiler-library-fixtures.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'

test('void library operation создаёт runtime callback wrapper с захватами', () => {
  const libraries = createCompilerLibrarySetWithConsole([visitorLibrary()])
  const source = `
function visitOnce(): number {
  const total = 1
  bridge.visit((index) => total + index)
  return total
}

console.log(visitOnce())
`
  const result = compileSource(source, { libraries, target: 'cc' })

  assert.match(result.code, /static inox_status inox_callback_arrow_\d+\(/)
  assert.match(result.code, /struct inox_callback_context_\d+/)
  assert.match(result.code, /double inox_index = inox_callback_args\[0\]\.as\.number;/)
  assert.match(result.code, /bridge\.visit\(inox_callback_\d+\)/)
})

function visitorLibrary(): CompilerLibraryDescriptor {
  return {
    id: 'bridge',
    dependencies: [],
    declarations: [],
    operations: [
      {
        libraryId: 'bridge',
        bindingId: 'global:bridge.visit',
        operationId: 'bridge#visit',
        kind: 'call',
        runtimeRequirements: ['bridge'],
        cExpression: 'bridge.visit',
        cArgumentKinds: ['runtime-callback'],
        resultTypeRef: fixturePrimitiveTypeRef('void'),
        minArgs: 1,
        maxArgs: 1,
        argumentChecks: [
          {
            valueTypes: ['function'],
            functionParameters: [
              {
                name: 'position',
                valueType: 'number',
                typeRef: fixturePrimitiveTypeRef('number')
              }
            ],
            functionReturnType: 'void',
            functionAsync: false
          }
        ]
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
