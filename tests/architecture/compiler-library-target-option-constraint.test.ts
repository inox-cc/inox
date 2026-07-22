import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { CompileError } from '../../compiler/diagnostics.ts'
import {
  createCompilerLibrarySetWithSyntheticGlobalDeclarations,
  fixturePrimitiveTypeRef
} from './helpers/compiler-library-fixtures.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'

const libraryId = 'fixture:accelerator'
const optionId = `${libraryId}#mode`
const requirementId = `${libraryId}#native`

test('runtime requirement проверяет произвольный package option без core special case', () => {
  const libraries = createCompilerLibrarySetWithSyntheticGlobalDeclarations([acceleratorLibrary()])

  compileSource('accelerator.run()\n', {
    libraries,
    libraryOptions: [{ optionId, value: 'native' }]
  })

  assert.throws(
    () => compileSource('accelerator.run()\n', { libraries }),
    (error: unknown) =>
      error instanceof CompileError &&
      error.diagnostics.some(
        (item) => item.code === 'FIXTURE_ACCELERATOR_MODE' && item.message === 'native accelerator mode is required'
      )
  )
})

function acceleratorLibrary(): CompilerLibraryDescriptor {
  return {
    id: libraryId,
    dependencies: [],
    declarations: [],
    options: [
      {
        libraryId,
        optionId,
        cliAliases: [],
        valueType: 'string',
        defaultValue: 'portable',
        allowedValues: ['portable', 'native']
      }
    ],
    operations: [
      {
        libraryId,
        bindingId: 'global:accelerator.run',
        operationId: `${libraryId}#run`,
        kind: 'call',
        runtimeRequirements: [requirementId],
        cExpression: 'accelerator.run',
        cArgumentKinds: [],
        resultTypeRef: fixturePrimitiveTypeRef('void')
      }
    ],
    intrinsicBindings: [],
    runtimeRequirements: [
      {
        id: requirementId,
        dependencies: [],
        cPreludeIncludes: [],
        capabilities: [],
        optionConstraints: [
          {
            optionId,
            allowedValues: ['native'],
            diagnosticCode: 'FIXTURE_ACCELERATOR_MODE',
            diagnosticMessage: 'native accelerator mode is required'
          }
        ]
      }
    ]
  }
}
