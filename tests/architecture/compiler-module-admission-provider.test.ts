import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { CompileError } from '../../compiler/diagnostics.ts'
import { emptyCompilerLibrarySet } from '../../compiler/extensions/library-set.ts'
import type { CompilerLibrarySet } from '../../compiler/extensions/types.ts'

test('external module admission depends only on the selected library provider', () => {
  for (const source of ['extension:missing', 'node:missing']) {
    assert.throws(
      () => compileSource(`import { value } from '${source}'\n`, { libraries: emptyCompilerLibrarySet }),
      (error: unknown) =>
        error instanceof CompileError &&
        error.diagnostics[0].code === 'INOX_UNSUPPORTED_IMPORT_SOURCE' &&
        error.diagnostics[0].message === `only relative imports are implemented, got ${source}`
    )
  }

  const source = 'fixture:provided-module'
  const libraries: CompilerLibrarySet = {
    ...emptyCompilerLibrarySet,
    fingerprint: 'fixture:provided-module:v1',
    declarations: [
      {
        libraryId: 'fixture:provider',
        kind: 'module',
        source,
        declarationSource: 'fixture/provided-module/index.d.ts',
        compilerImplemented: true
      }
    ]
  }

  assert.doesNotThrow(() => compileSource(`import { value } from '${source}'\n`, { libraries }))
})
