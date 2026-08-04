import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor, LibraryOperationDescriptor } from '../../compiler/extensions/types.ts'

test('package operation metadata preserves observable call order without a fake throw contract', () => {
  const result = compileSource(
    `
      function consume(first: number, second: number) {}
      consume(fixtureTake(), fixtureRead())
    `,
    { libraries: createCompilerLibrarySet([fixtureLibrary()]), target: 'cc' }
  )

  assert.match(result.code, /auto inox_library_result_\d+ = fixtureTake\(\);/)
  assert.match(result.code, /consume\(inox_library_result_\d+, fixtureRead\(\)\);/)
  assert.doesNotMatch(result.code, /fixtureTake\(\);\n\s+if \(inox::thrown\(\)\)/)
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
        declarationSource:
          'export {}; declare global { function fixtureTake(): number; function fixtureRead(): number; }',
        compilerImplemented: true
      }
    ],
    nativeTypes: [],
    operations: [operation('fixtureTake', true), operation('fixtureRead', false)],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}

function operation(name: string, sideEffects: boolean): LibraryOperationDescriptor {
  return {
    libraryId: 'fixture',
    bindingId: `global:${name}`,
    operationId: `fixture#${name}`,
    kind: 'call',
    runtimeRequirements: [],
    cExpression: name,
    cArgumentKinds: [],
    cCallStyle: 'function',
    cFailureMode: null,
    cHasObservableSideEffects: sideEffects,
    minArgs: 0,
    maxArgs: 0,
    argumentChecks: [],
    resultTypeRef: {
      kind: 'primitive',
      name: 'number',
      nullable: false,
      ownership: 'value',
      traits: []
    }
  }
}
