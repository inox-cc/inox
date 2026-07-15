import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { CompileError } from '../../compiler/diagnostics.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'

test('library operation обобщённо проверяет значения вложенного object option', () => {
  const libraries = createCompilerLibrarySet([nestedObjectLibrary()])

  compileSource("bridge({ headers: { Accept: 'text/plain' } })", { libraries })
  assert.throws(
    () => compileSource('bridge({ headers: { Accept: 42 } })', { libraries }),
    (error: unknown) => error instanceof CompileError && error.diagnostics[0].code === 'INOX_TYPE_MISMATCH'
  )
})

function nestedObjectLibrary(): CompilerLibraryDescriptor {
  return {
    id: 'bridge',
    dependencies: [],
    declarations: [
      {
        libraryId: 'bridge',
        kind: 'global',
        source: 'bridge/index.d.ts',
        declarationSource: 'export {}\ndeclare global { function bridge(options: object): void; }',
        compilerImplemented: true
      }
    ],
    operations: [
      {
        libraryId: 'bridge',
        bindingId: 'global:bridge',
        operationId: 'bridge#call',
        kind: 'call',
        runtimeRequirements: [],
        cExpression: 'bridge',
        cArgumentKinds: ['value'],
        minArgs: 1,
        maxArgs: 1,
        argumentChecks: [
          {
            valueTypes: ['object'],
            objectLiteralFields: [
              {
                name: 'headers',
                valueTypes: ['object'],
                objectLiteralRequired: true,
                objectFieldValueType: 'string'
              }
            ]
          }
        ],
        valueType: 'void',
        cppType: 'void'
      }
    ],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}
