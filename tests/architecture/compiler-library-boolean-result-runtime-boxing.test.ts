import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'

test('boolean result библиотечной операции упаковывается для поля runtime-объекта', () => {
  const libraries = createCompilerLibrarySet([fixtureLibrary()])
  const result = compileSource('const result = { value: fixtureFlag() }', { libraries, target: 'cc' })

  assert.match(result.code, /\.init\(0, inox_bool_value\(\(fixtureFlag\(\)\) != 0\)\);/)
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
        declarationSource: 'export {}; declare global { function fixtureFlag(): boolean; }',
        compilerImplemented: true
      }
    ],
    operations: [
      {
        libraryId: 'fixture',
        bindingId: 'global:fixtureFlag',
        operationId: 'fixture#flag',
        kind: 'call',
        runtimeRequirements: [],
        cExpression: 'fixtureFlag',
        cArgumentKinds: [],
        cCallStyle: 'function',
        minArgs: 0,
        maxArgs: 0,
        argumentChecks: [],
        resultTypeRef: {
          kind: 'primitive',
          name: 'boolean',
          nullable: false,
          ownership: 'value',
          traits: []
        },
        cResultMapping: { cppType: 'bool', fields: [] }
      }
    ],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}
