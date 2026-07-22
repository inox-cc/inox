import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'
import { fixturePrimitiveTypeRef } from './helpers/compiler-library-fixtures.ts'

test('zero-argument runtime initializer эмитится как C++ object', () => {
  const libraries = createCompilerLibrarySet([fixtureLibrary()])
  const result = compileSource('fixture()\n', { libraries })

  assert.match(result.code, /inline FixtureRuntime fixtureRuntime\{\};/)
  assert.doesNotMatch(result.code, /FixtureRuntime fixtureRuntime\(\);/)
})

function fixtureLibrary(): CompilerLibraryDescriptor {
  return {
    id: 'global:fixture',
    dependencies: [],
    declarations: [
      {
        libraryId: 'global:fixture',
        kind: 'global',
        source: 'stdlib/global/fixture/index.d.ts',
        declarationSource: 'export {}; declare global { function fixture(): number; }',
        compilerImplemented: true
      }
    ],
    runtimeInitializers: [
      {
        libraryId: 'global:fixture',
        initializerId: 'global:fixture#runtime',
        runtimeRequirement: 'global:fixture',
        cType: 'FixtureRuntime',
        cName: 'fixtureRuntime',
        arguments: []
      }
    ],
    nativeTypes: [],
    operations: [
      {
        libraryId: 'global:fixture',
        bindingId: 'global:fixture',
        operationId: 'global:fixture#call',
        kind: 'call',
        runtimeRequirements: ['global:fixture'],
        cExpression: 'fixture',
        cArgumentKinds: [],
        resultTypeRef: fixturePrimitiveTypeRef('number')
      }
    ],
    intrinsicBindings: [],
    runtimeRequirements: [
      {
        id: 'global:fixture',
        dependencies: [],
        cPreludeIncludes: ['fixture.h'],
        capabilities: []
      }
    ]
  }
}
