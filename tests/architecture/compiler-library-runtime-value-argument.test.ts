import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'

test('runtime-value argument applies a package-selected zero-argument class method', () => {
  const libraries = createCompilerLibrarySet([fixtureLibrary()])
  const result = compileSource(
    `
class Record {
  value: string

  constructor(value: string) {
    this.value = value
  }

  toFixture(): string {
    return this.value
  }
}

const record = new Record('Ada')
const text = encodeFixture(record)
`,
    { libraries }
  )

  assert.match(result.code, /record\.toFixture\(\)/)
  assert.match(result.code, /encodeFixture\(inox::Value\(inox_method_value_\d+\)\)/)
  assert.doesNotMatch(result.code, /inox_class_instance_ref_copy/)
})

test('runtime-value argument materializes a class instance when the selected method is absent', () => {
  const libraries = createCompilerLibrarySet([fixtureLibrary()])
  const result = compileSource(
    `
class Record {
  value: string

  constructor(value: string) {
    this.value = value
  }
}

const record = new Record('Ada')
const text = encodeFixture(record)
`,
    { libraries }
  )

  assert.match(result.code, /inox_class_instance_ref_copy/)
  assert.match(result.code, /encodeFixture\(inox_class_instance_\d+\)/)
})

function fixtureLibrary(): CompilerLibraryDescriptor {
  return {
    id: 'fixture',
    dependencies: [],
    declarations: [
      {
        libraryId: 'fixture',
        kind: 'global',
        source: 'fixture/index.d.ts',
        declarationSource: 'export {}; declare global { function encodeFixture(value: unknown): string; }',
        compilerImplemented: true
      }
    ],
    operations: [
      {
        libraryId: 'fixture',
        bindingId: 'global:encodeFixture',
        operationId: 'fixture#encode',
        kind: 'call',
        runtimeRequirements: [],
        cExpression: 'encodeFixture',
        cArgumentKinds: ['runtime-value'],
        cArgumentMethodNames: ['toFixture'],
        cCallStyle: 'function',
        minArgs: 1,
        maxArgs: 1,
        argumentChecks: [],
        resultTypeRef: {
          kind: 'primitive',
          name: 'string',
          nullable: false,
          ownership: 'value',
          traits: []
        },
        cResultMapping: { cppType: 'inox::String', fields: [] }
      }
    ],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}
