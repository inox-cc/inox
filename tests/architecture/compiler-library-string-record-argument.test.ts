import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'
import { createCompilerLibrarySetWithConsole, fixturePrimitiveTypeRef } from './helpers/compiler-library-fixtures.ts'

test('string-record argument lowering остаётся generic и сохраняет fallback для переменной', () => {
  const result = compileSource(
    "const page = '1'\nbridge.make({ q: 'smoke', page })\nbridge.make('q=direct')\nconst init = { q: 'dynamic' }\nbridge.make(init)\n",
    {
      libraries: createCompilerLibrarySetWithConsole([bridgeLibrary()]),
      target: 'cc'
    }
  )

  assert.match(result.code, /bridge\.make\(\{ \{ "q", "smoke" \}, \{ "page", page \} \}\)/)
  assert.match(result.code, /bridge\.make\("q=direct"\)/)
  assert.match(result.code, /inox::ObjectValue::create/)
  assert.match(result.code, /bridge\.make\(init\)/)
})

function bridgeLibrary(): CompilerLibraryDescriptor {
  return {
    id: 'bridge',
    dependencies: [],
    declarations: [],
    operations: [
      {
        libraryId: 'bridge',
        bindingId: 'global:bridge.make',
        operationId: 'bridge#make',
        kind: 'call',
        runtimeRequirements: [],
        cExpression: 'bridge.make',
        cArgumentKinds: ['optional-string-record-or-value'],
        minArgs: 0,
        maxArgs: 1,
        argumentChecks: [{ valueTypes: ['string', 'object'], objectFieldValueType: 'string' }],
        resultTypeRef: fixturePrimitiveTypeRef('void')
      }
    ],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}
