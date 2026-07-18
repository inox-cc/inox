import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSourceToIr } from '../../compiler/core.ts'
import { CompileError } from '../../compiler/diagnostics.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type { CompilerLibraryDescriptor } from '../../compiler/extensions/types.ts'

test('global operation не объявляет отсутствующий ambient symbol', () => {
  const libraries = createCompilerLibrarySet([operationOnlyLibrary()])

  assert.throws(
    () => compileSourceToIr('fixtureGlobal.run()\n', { libraries }),
    (error: unknown) => error instanceof CompileError && error.diagnostics[0].code === 'INOX_UNKNOWN_NAME'
  )
})

function operationOnlyLibrary(): CompilerLibraryDescriptor {
  return {
    id: 'global:fixture',
    dependencies: [],
    declarations: [],
    nativeTypes: [],
    operations: [
      {
        libraryId: 'global:fixture',
        bindingId: 'global:fixtureGlobal.run',
        operationId: 'global:fixture#run',
        kind: 'call',
        runtimeRequirements: [],
        cExpression: 'fixtureGlobal.run'
      }
    ],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}
