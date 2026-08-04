import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSourceToIr } from '../../compiler/core.ts'
import { CompileError } from '../../compiler/diagnostics.ts'
import type { CompilerLibraryDescriptor, TypeRef } from '../../compiler/extensions/types.ts'
import { createCompilerLibrarySetWithSyntheticGlobalDeclarations as createCompilerLibrarySet } from './helpers/compiler-library-fixtures.ts'

test('library argument TypeRefs accept any declared alternative', () => {
  const libraries = createCompilerLibrarySet([fixtureLibrary([primitiveTypeRef('string'), primitiveTypeRef('number')])])

  assert.doesNotThrow(() => compileSourceToIr("acceptFixture('ready')\nacceptFixture(1)\n", { libraries }))
  assert.throws(
    () => compileSourceToIr('acceptFixture(true)\n', { libraries }),
    (error: unknown) => error instanceof CompileError && error.diagnostics[0].code === 'INOX_TYPE_MISMATCH'
  )
})

function fixtureLibrary(typeRefs: TypeRef[]): CompilerLibraryDescriptor {
  return {
    id: 'fixture',
    dependencies: [],
    declarations: [],
    operations: [
      {
        libraryId: 'fixture',
        bindingId: 'global:acceptFixture',
        operationId: 'fixture.accept',
        kind: 'call',
        runtimeRequirements: [],
        minArgs: 1,
        maxArgs: 1,
        argumentChecks: [{ valueTypes: [], typeRefs }]
      }
    ],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}

function primitiveTypeRef(name: 'number' | 'string'): TypeRef {
  return {
    kind: 'primitive',
    name,
    nullable: false,
    ownership: 'value',
    traits: []
  }
}
