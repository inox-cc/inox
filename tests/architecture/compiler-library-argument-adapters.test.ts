import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'

test('library C arguments поддерживают templates и string-view-or-value lowering', () => {
  const result = compileSource(
    "const payload = { ok: true }\nbridge.take(3)\nbridge.accept('text')\nbridge.accept(payload)\n",
    { libraries: createCompilerLibrarySet([bridgeLibrary()]), target: 'cc' }
  )

  assert.match(result.code, /bridge\.take\(static_cast<int>\(3(?:\.0)?\)\)/)
  assert.match(result.code, /bridge\.accept\("text"\)/)
  assert.match(result.code, /bridge\.accept\(inox::Value\(payload\)\)/)
})

function bridgeLibrary(): CompilerLibraryDescriptor {
  return {
    id: 'bridge',
    dependencies: [],
    declarations: [],
    operations: [
      {
        libraryId: 'bridge',
        bindingId: 'global:bridge.take',
        operationId: 'bridge#take',
        kind: 'call',
        runtimeRequirements: [],
        cExpression: 'bridge.take',
        cArgumentKinds: ['number'],
        cArgumentAdapters: ['static_cast<int>($value)'],
        minArgs: 1,
        maxArgs: 1,
        argumentChecks: [{ valueTypes: ['number'] }],
        cppType: 'void',
        valueType: 'void'
      },
      {
        libraryId: 'bridge',
        bindingId: 'global:bridge.accept',
        operationId: 'bridge#accept',
        kind: 'call',
        runtimeRequirements: [],
        cExpression: 'bridge.accept',
        cArgumentKinds: ['string-view-or-value'],
        cArgumentAdapters: ['$value'],
        minArgs: 1,
        maxArgs: 1,
        argumentChecks: [{ valueTypes: ['string', 'object'] }],
        cppType: 'void',
        valueType: 'void'
      }
    ],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}
