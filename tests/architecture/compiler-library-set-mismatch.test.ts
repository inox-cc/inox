import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSourceToIr, emitTargetFromIr } from '../../compiler/core.ts'
import { emptyCompilerLibrarySet } from '../../compiler/extensions/library-set.ts'
import type { CompilerLibrarySet } from '../../compiler/extensions/types.ts'

test('IR emission rejects a different compiler library set', () => {
  const libraries = testLibrarySet('test:library-set:a')
  const compiled = compileSourceToIr('const answer = 40 + 2', { libraries })

  assert.doesNotThrow(() => emitTargetFromIr('cc', compiled.ir, { libraries }))
  assert.throws(
    () => emitTargetFromIr('cc', compiled.ir, { libraries: emptyCompilerLibrarySet }),
    /Compiler library set fingerprint mismatch/
  )
})

function testLibrarySet(fingerprint: string): CompilerLibrarySet {
  return {
    fingerprint,
    declarations: [],
    operations: [],
    intrinsicBindings: [],
    runtimeRequirements: []
  }
}
