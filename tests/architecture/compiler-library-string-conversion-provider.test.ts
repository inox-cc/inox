import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { CompileError } from '../../compiler/diagnostics.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import { emptyCompilerLibrarySet } from '../../compiler/extensions/library-set.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'

const source = `
class Record {
  value: string

  constructor(value: string) {
    this.value = value
  }

  renderFixture(): string {
    return this.value
  }
}

const record = new Record('Ada')
const template = \`record: \${record}\`
const concat = 'record: ' + record
`

test('implicit class string conversion uses the selected intrinsic provider method', () => {
  const result = compileSource(source, { libraries: createCompilerLibrarySet([fixtureLibrary()]) })

  assert.match(result.code, /record\.renderFixture\(\)/)
  assert.doesNotMatch(result.code, /record\.toString\(\)/)
})

test('implicit class string conversion does not infer a target method without a provider', () => {
  assert.throws(
    () => compileSource(source, { libraries: emptyCompilerLibrarySet }),
    (error: unknown) =>
      error instanceof CompileError &&
      error.diagnostics.length === 2 &&
      error.diagnostics.every(
        (item) =>
          item.code === 'INOX_MISSING_INTRINSIC_PROVIDER' &&
          item.message === 'missing compiler library intrinsic provider string-conversion'
      )
  )
})

function fixtureLibrary(): CompilerLibraryDescriptor {
  return {
    id: 'fixture:string-conversion',
    dependencies: [],
    declarations: [
      {
        libraryId: 'fixture:string-conversion',
        kind: 'global',
        source: 'tests/architecture/fixtures/string-conversion.d.ts',
        declarationSource: 'export {}; declare global { function stringifyFixture(value: unknown): string; }',
        compilerImplemented: true
      }
    ],
    nativeTypes: [],
    operations: [
      {
        libraryId: 'fixture:string-conversion',
        bindingId: 'global:stringifyFixture',
        operationId: 'fixture:string-conversion#call',
        kind: 'call',
        runtimeRequirements: [],
        cExpression: 'stringifyFixture',
        cArgumentKinds: ['runtime-value'],
        cArgumentMethodNames: ['renderFixture'],
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
    intrinsicBindings: [{ role: 'string-conversion', bindingId: 'global:stringifyFixture' }],
    runtimeRequirements: []
  }
}
