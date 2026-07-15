import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'

test('number result библиотечной операции упаковывается для поля runtime-объекта', () => {
  const libraries = createCompilerLibrarySet([fixtureLibrary()])
  const result = compileSource('const result = { value: fixtureCount() }', { libraries, target: 'cc' })

  assert.match(result.code, /\.init\(0, inox_number_value\(fixtureCount\(\)\)\);/)
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
        declarationSource: 'export {}; declare global { function fixtureCount(): number; }',
        compilerImplemented: true
      }
    ],
    operations: [
      {
        libraryId: 'fixture',
        bindingId: 'global:fixtureCount',
        operationId: 'fixture#count',
        kind: 'call',
        runtimeRequirements: [],
        cExpression: 'fixtureCount',
        cArgumentKinds: [],
        cCallStyle: 'function',
        minArgs: 0,
        maxArgs: 0,
        argumentChecks: [],
        resultTypeRef: {
          kind: 'primitive',
          name: 'number',
          nullable: false,
          ownership: 'value',
          traits: []
        },
        cResultMapping: { cppType: 'size_t', fields: [] }
      }
    ],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}
