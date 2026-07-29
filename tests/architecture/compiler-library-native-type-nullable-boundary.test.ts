import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'

test('nullable native type keeps runtime representation across throwing function boundary', () => {
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

  assert.match(result.code, /inox_value maybe\(inox_value value\)/)
  assert.match(result.code, /inox::throw_value\(inox_throw_error_\d+\);/)
  assert.match(result.code, /if \(inox::thrown\(\)\) goto catch_\d+;/)
  assert.doesNotMatch(result.code, /\binox_status\b/)
  assert.doesNotMatch(result.code, /\binox_error_out\b/)
  assert.doesNotMatch(result.code, /FixtureBridge\* inox_out/)
  assert.doesNotMatch(result.code, /FixtureBridge inox_call_result/)
})

test('nullable native local accepts a native assignment without a generic object guard', () => {
  const result = compileSource(
    `
function assign(input: Bridge): Bridge | null {
  let value: Bridge | null = null
  value = input
  return value
}
`,
    { libraries: createCompilerLibrarySet([bridgeLibrary()]), target: 'cc' }
  )

  assert.match(result.code, /auto inox_nullable_value_[0-9]+ = input;/)
  assert.doesNotMatch(result.code, /inox_nullable_value_[0-9]+\.tag != INOX_TAG_OBJECT/)
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
