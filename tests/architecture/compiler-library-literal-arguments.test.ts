import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { CompileError } from '../../compiler/diagnostics.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'

test('library argument checks владеют literal restrictions и diagnostics', () => {
  const libraries = createCompilerLibrarySet([codecLibrary()])

  assert.throws(
    () => compileSource("codec.open('sha1')\n", { libraries }),
    (error: unknown) =>
      error instanceof CompileError &&
      error.diagnostics.some(
        (item) =>
          item.code === 'CODEC_ALGORITHM' &&
          item.message === "codec.open only supports 'sha256'"
      )
  )
})

function codecLibrary(): CompilerLibraryDescriptor {
  return {
    id: 'codec',
    dependencies: [],
    declarations: [],
    operations: [
      {
        libraryId: 'codec',
        bindingId: 'global:codec.open',
        operationId: 'codec#open',
        kind: 'call',
        runtimeRequirements: [],
        cExpression: 'codec.open',
        cArgumentKinds: ['string-view'],
        minArgs: 1,
        maxArgs: 1,
        argumentChecks: [
          {
            valueTypes: ['string'],
            stringLiterals: ['sha256'],
            literalDiagnosticCode: 'CODEC_ALGORITHM',
            literalDiagnosticMessage: "codec.open only supports 'sha256'"
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
