import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'

test('nullable native type keeps runtime ABI across throwing function boundary', () => {
  const result = compileSource(
    `
function maybe(value: Bridge | null): Bridge | null {
  if (value) throw 'error'
  return null
}

try {
  maybe(null)
} catch (error) {}
`,
    { libraries: createCompilerLibrarySet([bridgeLibrary()]), target: 'cc' }
  )

  assert.match(result.code, /inox_status maybe\(inox_value value, inox_value\* inox_out, inox_value\* inox_error_out\)/)
  assert.match(result.code, /\*inox_out = inox_undefined_value\(\);/)
  assert.doesNotMatch(result.code, /FixtureBridge\* inox_out/)
  assert.doesNotMatch(result.code, /FixtureBridge inox_call_result/)
})

function bridgeLibrary(): CompilerLibraryDescriptor {
  return {
    id: 'fixture',
    dependencies: [],
    declarations: [
      {
        libraryId: 'fixture',
        kind: 'global',
        source: 'stdlib/fixture/index.d.ts',
        declarationSource: 'export {}; declare global { class Bridge {} }',
        compilerImplemented: true
      }
    ],
    nativeTypes: [
      {
        libraryId: 'fixture',
        typeId: 'fixture#Bridge',
        declarationNames: ['Bridge'],
        valueType: 'object',
        cppType: 'FixtureBridge',
        baseTypeIds: [],
        runtimeRequirements: [],
        cValueAdapter: 'FixtureBridge($value)'
      }
    ],
    operations: [],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}
